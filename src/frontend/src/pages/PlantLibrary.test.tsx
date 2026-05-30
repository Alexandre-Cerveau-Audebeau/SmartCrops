import { render, screen } from '@testing-library/react';
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
});
