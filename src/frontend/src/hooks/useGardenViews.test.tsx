import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import GardensBlock from '../components/Dashboard/blocks/GardensBlock';
import StatsBlock from '../components/Dashboard/blocks/StatsBlock';
import type { DashboardGardenData } from '../types/DashboardData';

/**
 * SMA-336 PR 2/5, round 1 (E10 / G4 / E22) — the MEASUREMENT behind the memo.
 *
 * The claim is that the exposure engine runs once per garden per load, whatever
 * happens on the page afterwards and however many widgets want the answer. It is
 * counted rather than argued: `computeExposureView` is the heaviest of the five
 * O(width × height) passes `deriveGardenView` makes, it is the one function
 * every path goes through, and mocking it here counts real calls without
 * changing a single result — the wrapper delegates to the real implementation.
 */
const calls: string[] = [];

vi.mock('../pages/gardenPlanner/exposureView', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../pages/gardenPlanner/exposureView')>();
  return {
    ...actual,
    computeExposureView: (input: Parameters<typeof actual.computeExposureView>[0]) => {
      calls.push(input.garden?.id ?? '(no garden)');
      return actual.computeExposureView(input);
    },
  };
});

vi.mock('../services/gardenApi', () => ({
  updateGarden: vi.fn().mockResolvedValue(undefined),
  deleteGarden: vi.fn(),
}));

let seq = 0;

/** A fresh object every time — `useDashboardData` builds new ones on each fetch. */
const garden = (id: string, name: string): DashboardGardenData => ({
  id,
  name,
  description: null,
  width: 6,
  height: 4,
  cellSize: '50cm',
  cellsJson: null,
  config: {
    orientation: 'S',
    gardenType: null,
    lightSchedule: null,
    hemisphere: 'N',
    latitudeBand: 'mid',
  },
  updatedAt: `2026-05-0${(seq++ % 8) + 1}T00:00:00Z`,
  placements: [],
  placementCount: 0,
  varietyCount: 0,
  occupiedCells: 0,
  isEdible: null,
});

function renderBoth(gardens: DashboardGardenData[]) {
  localStorage.setItem('smartcrops-language', 'en');
  return render(
    <ThemeProvider theme={createTheme()}>
      <LanguageProvider>
        <MemoryRouter>
          <GardensBlock
            size="large"
            gardens={gardens}
            loading={false}
            loadError={false}
            onCreateClick={() => {}}
            onChanged={() => {}}
            onDeleted={() => {}}
            onExpand={() => {}}
          />
          <StatsBlock
            size="large"
            gardens={gardens}
            loading={false}
            loadError={false}
            onRetry={() => {}}
          />
        </MemoryRouter>
      </LanguageProvider>
    </ThemeProvider>
  );
}

beforeEach(() => {
  calls.length = 0;
});

describe('the exposure engine runs once per garden', () => {
  it('once per garden, not once per garden per widget', () => {
    // Both widgets are on an Expert page at the same time, and both derive the
    // same GardenView for the same gardens. Before the shared memo the engine
    // ran twice per garden on every load.
    const gardens = [garden('g1', 'Terrasse'), garden('g2', 'Balcon')];

    renderBoth(gardens);

    expect(calls).toEqual(['g1', 'g2']);
  });

  it('not again when the Gardens widget re-renders on its own state', () => {
    // The trigger is ordinary: `GardensBlock` owns the rename dialog, so
    // `setEditName` re-rendered the Large table on every keystroke and the
    // engine re-ran once per garden per character typed.
    const gardens = [garden('g1', 'Terrasse'), garden('g2', 'Balcon')];
    renderBoth(gardens);
    const before = calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Edit Terrasse' }));
    const field = screen.getByRole('textbox', { name: /^Name/ });
    for (const value of ['Terrass', 'Terra', 'Terrasse du haut']) {
      fireEvent.change(field, { target: { value } });
    }

    expect(calls.length).toBe(before);
  });

  it('derives again when the aggregate brings new garden objects', () => {
    // The cache must not be a leak: a re-fetch builds new objects, and those
    // must be derived rather than served from a previous load.
    const first = [garden('g1', 'Terrasse')];
    const { unmount } = renderBoth(first);
    unmount();
    calls.length = 0;

    renderBoth([garden('g1', 'Terrasse')]);

    expect(calls).toEqual(['g1']);
  });
});
