import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { presetFor } from '../constants/dashboardPresets';

vi.mock('../services/gardenApi', () => ({
  createGarden: vi.fn(),
  updateGarden: vi.fn(),
  deleteGarden: vi.fn(),
}));

vi.mock('../services/dashboardApi', () => ({
  fetchDashboardPreferences: vi.fn(),
  saveDashboardPreferences: vi.fn(),
  fetchDashboardData: vi.fn(),
}));

import type {
  DashboardData,
  DashboardGardenData,
  DashboardVarietyData,
} from '../types/DashboardData';
import GardensDashboard from './GardensDashboard';
import {
  fetchDashboardData,
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';

// SMA-336 PR 2/5 (B7) — the gear stops opening on an empty panel. The two
// entries of artboard A8 write to `DashboardBlock.options`, the document PR 1/5
// stored and round-tripped without ever writing to it.

const garden = (id: string, name: string): DashboardGardenData => ({
  id,
  name,
  description: null,
  width: 4,
  height: 3,
  cellSize: '50cm',
  cellsJson: null,
  config: {
    orientation: null,
    gardenType: null,
    lightSchedule: null,
    hemisphere: 'N',
    latitudeBand: 'mid',
  },
  updatedAt: '2026-05-01T00:00:00Z',
  placements: [],
  placementCount: 1,
  varietyCount: 1,
  occupiedCells: 1,
  isEdible: true,
});

const variety = (
  plantId: string,
  commonName: string,
  gardenIds: string[]
): DashboardVarietyData => ({
  plantId,
  scientificName: 'Ocimum basilicum',
  commonName,
  plantType: 'Herb',
  isEdible: true,
  imageUrl: 'https://bs.plantnet.org/habit.jpg',
  imageAttribution: 'Credit',
  count: 2,
  cells: 2,
  gardenIds,
});

const data: DashboardData = {
  gardens: [garden('g1', 'Terrasse'), garden('g2', 'Balcon')],
  varieties: [
    variety('p-1', 'Basil', ['g1']),
    variety('p-2', 'Aubergine', ['g2']),
  ],
  totals: {
    gardenCount: 2,
    placementCount: 4,
    varietyCount: 2,
    catalogPlantCount: 536,
  },
};

/** The last layout the debounced save sent. */
const lastSaved = () => {
  const calls = vi.mocked(saveDashboardPreferences).mock.calls;
  return calls[calls.length - 1]![0];
};

const countersOptionsOf = (
  blocks: { key: string; options?: Record<string, unknown> | null }[]
) => blocks.find((block) => block.key === 'counters')?.options;

beforeEach(() => {
  localStorage.setItem('smartcrops-language', 'en');
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level: 'expert',
    isPreset: true,
    blocks: presetFor('expert'),
    updatedAt: null,
  });
  vi.mocked(saveDashboardPreferences).mockClear();
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
  vi.mocked(fetchDashboardData).mockResolvedValue(data);
});

afterEach(() => vi.clearAllMocks());

function renderPage() {
  render(
    <LanguageProvider>
      <MemoryRouter>
        <GardensDashboard />
      </MemoryRouter>
    </LanguageProvider>
  );
}

async function openCountersOptions() {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  await screen.findByRole('button', { name: 'Done' });
  fireEvent.click(
    screen.getByRole('button', { name: 'Counts by variety options' })
  );
  return await screen.findByRole('menu');
}

describe('the Counters widget options (artboard A8)', () => {
  it('offers the two entries the frozen design draws', async () => {
    const menu = await openCountersOptions();

    expect(within(menu).getByText('Widget options')).toBeInTheDocument();
    expect(
      within(menu).getByRole('switch', { name: 'Plant photos' })
    ).toBeInTheDocument();
    expect(within(menu).getByRole('combobox', { name: 'Garden' })).toBeInTheDocument();
    // And no longer the sentence that stood in for them.
    expect(within(menu).queryByText('No option for this widget yet.')).toBeNull();
  });

  it('a widget with no settings still says so', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    await screen.findByRole('button', { name: 'Done' });

    fireEvent.click(screen.getByRole('button', { name: 'Tips options' }));

    const menu = await screen.findByRole('menu');
    expect(
      within(menu).getByText('No option for this widget yet.')
    ).toBeInTheDocument();
  });

  it('turning photos on persists it on the block', async () => {
    const menu = await openCountersOptions();

    fireEvent.click(within(menu).getByRole('switch', { name: 'Plant photos' }));

    await waitFor(() =>
      expect(countersOptionsOf(lastSaved().blocks)).toEqual({
        photos: true,
        garden: 'all',
      })
    );
  });

  it('turning photos on draws them, and leaves the other widgets alone', async () => {
    const menu = await openCountersOptions();

    fireEvent.click(within(menu).getByRole('switch', { name: 'Plant photos' }));

    const widget = document.querySelector('[data-widget="counters"]')!;
    await waitFor(() =>
      expect(widget.querySelectorAll('img').length).toBeGreaterThan(0)
    );

    // And the setting lands on THAT block only: a document written onto the
    // wrong one would be stored, round-tripped and never noticed, because seven
    // of the eight widgets read no options at all.
    await waitFor(() => expect(saveDashboardPreferences).toHaveBeenCalled());
    const others = lastSaved().blocks.filter((block) => block.key !== 'counters');
    expect(others.every((block) => !block.options)).toBe(true);
  });

  it('does NOT mark the layout « adjusted »', async () => {
    // The level chip tracks what the user REARRANGED — order, size, visibility.
    // Turning plant photos on is not a rearrangement, and `isAdjusted` excludes
    // options for exactly this reason.
    const menu = await openCountersOptions();
    expect(screen.getByText('Expert view')).toBeInTheDocument();

    fireEvent.click(within(menu).getByRole('switch', { name: 'Plant photos' }));

    await waitFor(() => expect(saveDashboardPreferences).toHaveBeenCalled());
    expect(screen.getByText('Expert view')).toBeInTheDocument();
    expect(screen.queryByText('Expert view · adjusted')).toBeNull();
  });

  it('picking a garden filters the widget and persists the choice', async () => {
    const menu = await openCountersOptions();

    fireEvent.mouseDown(within(menu).getByRole('combobox', { name: 'Garden' }));
    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByRole('option', { name: 'Balcon' }));

    await waitFor(() =>
      expect(countersOptionsOf(lastSaved().blocks)).toEqual({
        photos: false,
        garden: 'g2',
      })
    );
    const widget = within(
      document.querySelector('[data-widget="counters"]') as HTMLElement
    );
    await waitFor(() => expect(widget.queryByText('Basil')).toBeNull());
    expect(widget.getByText('Aubergine')).toBeInTheDocument();
  });
});
