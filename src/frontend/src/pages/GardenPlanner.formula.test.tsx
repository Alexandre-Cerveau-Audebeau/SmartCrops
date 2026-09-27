import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { catalogFor } from '../test/fixtures/formulas';
import type { GardenLayoutData } from '../services/gardenLayoutApi';
import type { DashboardLevel } from '../types/Dashboard';
import type { Garden } from '../types/Garden';

vi.mock('../services/plantApi', () => ({ fetchPlants: vi.fn() }));
vi.mock('../services/gardenApi', () => ({
  fetchGarden: vi.fn(),
  updateGarden: vi.fn(),
  deleteGarden: vi.fn(),
}));
vi.mock('../services/gardenLayoutApi', () => ({
  fetchLayout: vi.fn(),
  saveLayout: vi.fn(),
}));
vi.mock('../services/formulasApi', () => ({ fetchFormulas: vi.fn() }));

import GardenPlanner from './GardenPlanner';
import { fetchGarden } from '../services/gardenApi';
import { fetchLayout } from '../services/gardenLayoutApi';
import { fetchFormulas } from '../services/formulasApi';
import { fetchPlants } from '../services/plantApi';

// SMA-448, lot F3, step L3 — THE PLANNER BOUNDED BY THE SERVED FORMULA (V3:
// the planner shows the limit and disables what exceeds it; pre-flight,
// constat 5: the four add buttons had no bound at all). The bound of each
// dimension is the server's own rule: the larger of the formula's limit and
// the size the garden is stored at — a garden already beyond its formula
// keeps its size, shrinks freely, never grows (Alexandre, 22/09 18:02).

const EMPTY_CONFIG = { orientation: null, gardenType: null, lightSchedule: null, hemisphere: null, latitudeBand: null };

function serve(level: DashboardLevel, width: number, height: number) {
  vi.mocked(fetchGarden).mockResolvedValue({ id: 'g1', name: 'Test garden', layoutWidth: width, layoutHeight: height } as unknown as Garden);
  const layout: GardenLayoutData = { width, height, cellSize: '50cm', cellsJson: null, config: EMPTY_CONFIG, placements: [] };
  vi.mocked(fetchLayout).mockResolvedValue(layout);
  vi.mocked(fetchPlants).mockResolvedValue([]);
  vi.mocked(fetchFormulas).mockResolvedValue(catalogFor(level, { gardenCount: 1, largestGardenSize: { width, height } }));
}

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

const ADD = ['Add row at top', 'Add row at bottom', 'Add column on left', 'Add column on right'];
const REMOVE = ['Remove top row', 'Remove bottom row', 'Remove left column', 'Remove right column'];

async function enterShapeMode() {
  await screen.findByRole('grid');
  await waitFor(() => expect(fetchFormulas).toHaveBeenCalled());
  fireEvent.click(screen.getByText('Edit shape'));
  await screen.findByRole('button', { name: ADD[0]! });
}

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('smartcrops-language', 'en');
  await i18n.changeLanguage('en');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('the planner bounded by the formula (SMA-448, lot F3, L3)', () => {
  it('a Novice plan at 20 × 20: in shape mode the four add buttons are disabled and the limit is said; the four remove buttons stay live', async () => {
    serve('novice', 20, 20);
    renderPlanner();
    await enterShapeMode();

    await waitFor(() => {
      for (const name of ADD) expect(screen.getByRole('button', { name })).toBeDisabled();
    });
    for (const name of REMOVE) expect(screen.getByRole('button', { name })).toBeEnabled();
    const note = document.querySelector('[data-planner-limit]');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain('20 × 20');
    expect(note!.textContent).toContain('Novice');
  });

  it('a Novice plan at 10 × 8: the add buttons are live, and nothing is said', async () => {
    serve('novice', 10, 8);
    renderPlanner();
    await enterShapeMode();

    for (const name of ADD) expect(screen.getByRole('button', { name })).toBeEnabled();
    expect(document.querySelector('[data-planner-limit]')).toBeNull();
  });

  it('a Gardener plan already at 60 × 60 keeps its size: no growth beyond 60, a row removed may be added back, and the note says the plan is beyond the formula', async () => {
    serve('gardener', 60, 60);
    renderPlanner();
    await enterShapeMode();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add row at top' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Add column on right' })).toBeDisabled();
    expect(document.querySelector('[data-planner-limit]')!.textContent).toContain('60 × 60');

    fireEvent.click(screen.getByRole('button', { name: 'Remove top row' }));
    expect(screen.getByRole('button', { name: 'Add row at top' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Add row at bottom' })).toBeEnabled();
    // The columns are still at 60.
    expect(screen.getByRole('button', { name: 'Add column on left' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Add row at top' }));
    expect(screen.getByRole('button', { name: 'Add row at top' })).toBeDisabled();
  });

  it('the settings dialog bounds the columns and rows to the formula: a Novice typing 30 gets 20, and reads why', async () => {
    serve('novice', 10, 8);
    renderPlanner();
    await screen.findByRole('grid');
    await waitFor(() => expect(fetchFormulas).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const columns = await screen.findByLabelText('Columns');
    await waitFor(() => expect(columns).toHaveAttribute('max', '20'));
    expect(document.querySelector('[data-config-limit]')!.textContent).toContain('20 × 20');

    fireEvent.change(columns, { target: { value: '30' } });
    expect(columns).toHaveValue(20);
  });

  it('the settings dialog of a Gardener plan already at 60 × 60 bounds at 60, and says the plan is kept beyond the formula', async () => {
    serve('gardener', 60, 60);
    renderPlanner();
    await screen.findByRole('grid');
    await waitFor(() => expect(fetchFormulas).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const columns = await screen.findByLabelText('Columns');
    await waitFor(() => expect(columns).toHaveAttribute('max', '60'));
    expect(document.querySelector('[data-config-limit]')!.textContent).toContain('60 × 60');
  });

  it('the catalogue could not be read: the buttons stay live and nothing is said — the server remains the judge', async () => {
    serve('novice', 20, 20);
    vi.mocked(fetchFormulas).mockRejectedValue(new Error('down'));
    renderPlanner();
    await enterShapeMode();

    for (const name of ADD) expect(screen.getByRole('button', { name })).toBeEnabled();
    expect(document.querySelector('[data-planner-limit]')).toBeNull();
  });
});
