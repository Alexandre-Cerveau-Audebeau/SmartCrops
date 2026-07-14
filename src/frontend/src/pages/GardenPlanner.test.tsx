import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import type { GardenLayoutData } from '../services/gardenLayoutApi';
import type { Garden } from '../types/Garden';
import type { Plant } from '../types/Plant';

vi.mock('../services/plantApi', () => ({ fetchPlants: vi.fn() }));
vi.mock('../services/gardenApi', () => ({ fetchGarden: vi.fn() }));
vi.mock('../services/gardenLayoutApi', () => ({
  fetchLayout: vi.fn(),
  saveLayout: vi.fn(),
}));

import GardenPlanner from './GardenPlanner';
import { fetchGarden } from '../services/gardenApi';
import { fetchLayout } from '../services/gardenLayoutApi';
import { fetchPlants } from '../services/plantApi';

// Locks the transient wrong-initial artifact: a placement hydrating before
// the plant catalog used to render the 'U' of the 'Unknown' fallback for
// ~an instant, then self-correct once the catalog landed. Placement initials
// are now gated on the catalog being loaded.

const basil = { id: 'p1', scientificName: 'Basilicum fixture' } as Plant;
const maize = { id: 'p2', scientificName: 'Zea mays' } as Plant;

const garden = {
  id: 'g1',
  name: 'Test garden',
  gardenPlants: [],
} as unknown as Garden;

const layout: GardenLayoutData = {
  width: 2,
  height: 2,
  cellSize: '50cm',
  cellsJson: null,
  placements: [
    {
      id: 'pl1',
      plantId: 'p1',
      plantName: null,
      plantScientificName: null,
      startRow: 0,
      startCol: 0,
      spanRows: 1,
      spanCols: 1,
      notes: null,
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
  // jsdom ships no ResizeObserver; the planner observes its scroll container.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderPlanner() {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/gardens/g1/planner']}>
        <Routes>
          <Route path="/gardens/:id/planner" element={<GardenPlanner />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>
  );
}

describe('GardenPlanner placement initials', () => {
  it('renders no initial while the catalog is loading, then the real one (no "U" flash)', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    let resolveCatalog!: (plants: Plant[]) => void;
    vi.mocked(fetchPlants).mockImplementation(
      () =>
        new Promise<Plant[]>((resolve) => {
          resolveCatalog = resolve;
        })
    );

    renderPlanner();

    // Layout hydrates first — the grid is up while the catalog is pending.
    const grid = await screen.findByRole('grid');
    expect(within(grid).queryByText('U')).toBeNull();

    // Catalog lands → the real initial appears, never 'U'.
    resolveCatalog([basil]);
    await waitFor(() =>
      expect(within(grid).getByText('B')).toBeInTheDocument()
    );
    expect(within(grid).queryByText('U')).toBeNull();
  });

  it('keeps the Unknown fallback for a plant genuinely absent from the loaded catalog', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    vi.mocked(fetchPlants).mockResolvedValue([maize]);

    renderPlanner();

    const grid = await screen.findByRole('grid');
    await waitFor(() =>
      expect(within(grid).getByText('U')).toBeInTheDocument()
    );
  });
});
