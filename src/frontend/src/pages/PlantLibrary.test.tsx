import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18next from '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { useLanguage } from '../hooks/useLanguage';
import type { Plant } from '../types/Plant';
import type { FindPlantsParams, PlantFinderResult } from '../services/plantApi';

vi.mock('../services/plantApi', () => ({
  findPlants: vi.fn(),
  fetchPlantTypes: vi.fn(),
}));

import PlantLibrary from './PlantLibrary';
import { fetchPlantTypes, findPlants } from '../services/plantApi';

// SMA-255 T4 — the Library runs on the faceted finder with real server
// pagination, so this suite mocks findPlants (the single data path) and
// asserts the page/filter/language orchestration. The old suite's flake
// (SMA-174) came from real-timer debounce races; every debounce test below
// uses fake timers, everything else resolves synchronously-awaitable mocks.

afterEach(async () => {
  vi.clearAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  // A test below flips the language; reset the shared i18next singleton so the
  // English-label assertions in the other tests stay deterministic.
  await i18next.changeLanguage('en');
});

// Minimal in-provider control that flips the language exactly like the real
// Navbar toggle does (via useLanguage().setLanguage), so PlantLibrary sees the
// context change and re-fetches — without pulling the whole Navbar into the test.
function LangSwitch() {
  const { language, setLanguage } = useLanguage();
  return (
    <button
      type="button"
      onClick={() => setLanguage(language === 'en' ? 'fr' : 'en')}
    >
      switch language
    </button>
  );
}

// Items keep the PlantListItemResponse shape (identity + type + factual
// scalars, NO translations array) — the neutral list DTO the finder hydrates
// server-side, and exactly the payload that crashed the Library before the
// SMA-73 getTranslation guard.
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

const makeMany = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    makeListItem({
      id: `id-${i}`,
      scientificName: `Plant ${String(i).padStart(2, '0')}`,
    })
  );

// Serves 24-item pages out of `catalog`, mirroring the finder contract.
function pageOf(catalog: Plant[], page: number): PlantFinderResult {
  return {
    items: catalog.slice((page - 1) * 24, page * 24),
    found: catalog.length,
    page,
    perPage: 24,
    facetCounts: [],
  };
}

function mockFinderCatalog(catalog: Plant[]) {
  vi.mocked(findPlants).mockImplementation((params: FindPlantsParams) =>
    Promise.resolve(pageOf(catalog, params.page ?? 1))
  );
}

function renderLibrary() {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/library']}>
        <PlantLibrary />
      </MemoryRouter>
    </LanguageProvider>
  );
}

describe('PlantLibrary', () => {
  it('renders cards from the neutral list DTO (no translations) without crashing (SMA-73)', async () => {
    mockFinderCatalog([makeListItem()]);
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    renderLibrary();

    // The card title falls back to the scientific name (no common name in the
    // list DTO). Before the SMA-73 fix, the render threw a TypeError here.
    expect(
      await screen.findByRole('heading', { name: 'Achillea ptarmica' })
    ).toBeInTheDocument();
  });

  it('requests page 1 with perPage 24 and the current lang on mount', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    // No exact call count: StrictMode double-invokes the mount effect (the
    // first run is aborted and never commits). The contract is the params.
    expect(vi.mocked(findPlants)).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, perPage: 24, lang: 'en', q: undefined }),
      expect.anything()
    );
    // Server pagination: only page 1 (24 cards) is in the DOM.
    expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(24);
    expect(
      screen.getByRole('button', { name: 'Load more' })
    ).toBeInTheDocument();
  });

  it('debounces typing — keystrokes coalesce into one fetch 300ms after the last', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    // fireEvent (not userEvent) under fake timers: one synchronous change per
    // keystroke, no userEvent-internal timer coupling — deterministic by
    // construction (the SMA-174 flake came from real-timer debounce races).
    vi.useFakeTimers();
    const callsAfterMount = vi.mocked(findPlants).mock.calls.length;
    const textbox = screen.getByRole('textbox');

    fireEvent.change(textbox, { target: { value: 'la' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    fireEvent.change(textbox, { target: { value: 'lav' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    // The 'la' timer was cancelled by the 'lav' keystroke; 'lav' fires at
    // +300ms — one tick early, nothing has fired yet.
    expect(vi.mocked(findPlants).mock.calls).toHaveLength(callsAfterMount);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(vi.mocked(findPlants).mock.calls).toHaveLength(callsAfterMount + 1);
    expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: 'lav', page: 1 }),
      expect.anything()
    );
  });

  it('a single character stays match-all — no fetch until a 2nd character', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    vi.useFakeTimers();
    const callsAfterMount = vi.mocked(findPlants).mock.calls.length;
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'l' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(vi.mocked(findPlants).mock.calls).toHaveLength(callsAfterMount);
    // The current list stays visible.
    expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(24);
  });

  it('a type chip becomes a plantTypeIds server filter and replaces from page 1', async () => {
    const ornamentals = makeMany(3);
    vi.mocked(fetchPlantTypes).mockResolvedValue([
      { id: 4, name: 'Ornamental', description: null },
    ]);
    vi.mocked(findPlants).mockImplementation((params: FindPlantsParams) =>
      Promise.resolve(
        params.plantTypeIds?.length
          ? pageOf(ornamentals, params.page ?? 1)
          : pageOf(makeMany(50), params.page ?? 1)
      )
    );

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });
    expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(24);

    await user.click(screen.getByRole('button', { name: 'Ornamental' }));

    await waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(3)
    );
    expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
      expect.objectContaining({ plantTypeIds: [4], page: 1 }),
      expect.anything()
    );
  });

  it('Load more fetches the next page and APPENDS it (server pagination)', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });
    expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(24);

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(48)
    );
    expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
      expect.anything()
    );
    // Page 1 cards are still present — appended, not replaced.
    expect(
      screen.getByRole('heading', { name: 'Plant 00' })
    ).toBeInTheDocument();

    // 50 total → the last page (2 items) exhausts the results; button gone.
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(50)
    );
    expect(
      screen.queryByRole('button', { name: 'Load more' })
    ).not.toBeInTheDocument();
  });

  it('keeps the loaded slice on a language change by refetching the loaded pages (SMA-153)', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/library']}>
          <LangSwitch />
          <PlantLibrary />
        </MemoryRouter>
      </LanguageProvider>
    );
    await screen.findByRole('heading', { name: 'Plant 00' });

    // Grow to two loaded pages (24 → 48).
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(48)
    );
    vi.mocked(findPlants).mockClear();

    // Switching language refetches BOTH loaded pages in the new lang (no
    // exact call count — an aborted first pass from the i18next `t` identity
    // change can add framework-noise calls; the contract is that both pages
    // were requested in fr).
    await user.click(screen.getByRole('button', { name: 'switch language' }));
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenCalledWith(
        expect.objectContaining({ lang: 'fr', page: 1 }),
        expect.anything()
      )
    );
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenCalledWith(
        expect.objectContaining({ lang: 'fr', page: 2 }),
        expect.anything()
      )
    );
    // …and the visible slice is preserved — no collapse back to 24 (SMA-153).
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(48)
    );
  });

  it('shows noResults (not noPlants) when a search matches nothing', async () => {
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);
    vi.mocked(findPlants).mockImplementation((params: FindPlantsParams) =>
      Promise.resolve(
        params.q
          ? { items: [], found: 0, page: 1, perPage: 24, facetCounts: [] }
          : pageOf(makeMany(5), 1)
      )
    );

    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    vi.useFakeTimers();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zz' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    vi.useRealTimers();

    expect(
      await screen.findByText('No plants match your search.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No plants found yet — check back soon!')
    ).not.toBeInTheDocument();
  });

  it('shows noPlants when the catalogue itself is empty (no filter active)', async () => {
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);
    vi.mocked(findPlants).mockResolvedValue({
      items: [],
      found: 0,
      page: 1,
      perPage: 24,
      facetCounts: [],
    });

    renderLibrary();

    expect(
      await screen.findByText('No plants found yet — check back soon!')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No plants match your search.')
    ).not.toBeInTheDocument();
  });

  it('surfaces a finder failure through the error alert', async () => {
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);
    vi.mocked(findPlants).mockRejectedValue(
      new Error('Failed to find plants: 503')
    );

    renderLibrary();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to find plants: 503'
    );
  });

  it('exposes a polite status region that tracks the loaded/total count (a11y)', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Showing 24 of 50 plants');
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(status).toHaveTextContent('Showing 48 of 50 plants')
    );
  });
});
