import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import type { Plant } from '../types/Plant';

vi.mock('../services/plantApi', () => ({
  fetchPlants: vi.fn(),
  fetchPlantTypes: vi.fn(),
  searchPlants: vi.fn(),
}));

import PlantLibrary from './PlantLibrary';
import { fetchPlants, fetchPlantTypes, searchPlants } from '../services/plantApi';

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// Shape returned by GET /api/plants since PR #100 (PlantListItemResponse):
// identity + type + factual scalars, and crucially NO `translations` array.
// Typed as Plant (the frontend contract) but missing `translations` at runtime —
// exactly the payload that crashed the Library before the getTranslation guard.
function makeListItem(overrides: Partial<Plant> = {}): Plant {
  return {
    id: '00a098b2-b0d2-4ff8-a100-cee56088391e',
    scientificName: 'Achillea ptarmica',
    plantTypeId: 4,
    plantType: { id: 4, name: 'Ornamental', description: null },
    sunExposure: null,
    waterNeeds: null,
    ...overrides,
  } as unknown as Plant;
}

function renderLibrary() {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/library']}>
        <PlantLibrary />
      </MemoryRouter>
    </LanguageProvider>,
  );
}

describe('PlantLibrary', () => {
  it('renders cards from the neutral list DTO (no translations) without crashing (SMA-73)', async () => {
    vi.mocked(fetchPlants).mockResolvedValue([makeListItem()]);
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);
    vi.mocked(searchPlants).mockResolvedValue([]);

    renderLibrary();

    // The card title falls back to the scientific name (no common name in the
    // list DTO — restoring common names is a separate decision; SMA-73 is
    // resilience only). Before the fix, the render threw a TypeError here.
    expect(
      await screen.findByRole('heading', { name: 'Achillea ptarmica' }),
    ).toBeInTheDocument();
  });

  // SMA-58 — front-pure infinite scroll. Each PlantCard renders the name as an
  // <h6> (level-6 heading), so the count of level-6 headings == visible cards.
  // IntersectionObserver isn't implemented in jsdom; the guard + Load more button
  // cover the reveal logic deterministically here.
  const makeMany = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      makeListItem({ id: `id-${i}`, scientificName: `Plant ${String(i).padStart(2, '0')}` }),
    );

  it('renders only the initial slice (24) plus a Load more button when the list is larger', async () => {
    vi.mocked(fetchPlants).mockResolvedValue(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);
    vi.mocked(searchPlants).mockResolvedValue([]);

    renderLibrary();

    await screen.findByRole('heading', { name: 'Plant 00' });
    expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(24);
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
    // The 25th card (index 24) is not in the DOM yet.
    expect(screen.queryByRole('heading', { name: 'Plant 24' })).not.toBeInTheDocument();
  });

  it('reveals the next slice (+24) when Load more is clicked', async () => {
    vi.mocked(fetchPlants).mockResolvedValue(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);
    vi.mocked(searchPlants).mockResolvedValue([]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(24);
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(48);
    // 50 total → after a second click the button disappears (all shown).
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(50);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('resets the visible slice to 24 when the search query changes', async () => {
    vi.mocked(fetchPlants).mockResolvedValue(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);
    vi.mocked(searchPlants).mockResolvedValue([]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(48);

    // Typing resets the count immediately via the change handler (independent of
    // the debounced fetch, which doesn't fire under the test's real timers).
    await user.type(screen.getByRole('textbox'), 'ro');
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(24),
    );
  });

  it('resets the visible slice to 24 when the type filter changes', async () => {
    // 50 ornamentals (type 4) + a chip for type 4 so a click re-filters.
    vi.mocked(fetchPlants).mockResolvedValue(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([{ id: 4, name: 'Ornamental', description: null }]);
    vi.mocked(searchPlants).mockResolvedValue([]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(48);

    // Click the Ornamental chip → activeType set → slice resets (all 50 still match).
    await user.click(screen.getByRole('button', { name: 'Ornamental' }));
    expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(24);
  });

  it('exposes a polite status region that tracks the visible/total count (a11y)', async () => {
    vi.mocked(fetchPlants).mockResolvedValue(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);
    vi.mocked(searchPlants).mockResolvedValue([]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Showing 24 of 50 plants');
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(status).toHaveTextContent('Showing 48 of 50 plants');
  });
});
