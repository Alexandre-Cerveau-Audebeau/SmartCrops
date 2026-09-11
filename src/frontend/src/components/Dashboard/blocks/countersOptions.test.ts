import { describe, expect, it } from 'vitest';
import type {
  DashboardGardenData,
  DashboardVarietyData,
} from '../../../types/DashboardData';
import { placement } from '../../../test/fixtures/placements';
import {
  COUNTERS_GARDEN_ALL,
  countersOptions,
  resolveCountersFigures,
  resolveCountersGarden,
} from './countersOptions';

describe('countersOptions — reading a persisted document', () => {
  it('falls back to the defaults on nothing at all', () => {
    expect(countersOptions(null)).toEqual({
      photos: false,
      garden: COUNTERS_GARDEN_ALL,
    });
    expect(countersOptions(undefined)).toEqual({
      photos: false,
      garden: COUNTERS_GARDEN_ALL,
    });
  });

  it('trusts nothing it did not recognise', () => {
    expect(countersOptions({ photos: 'yes', garden: 42 })).toEqual({
      photos: false,
      garden: COUNTERS_GARDEN_ALL,
    });
    expect(countersOptions({ photos: true, garden: '' }).garden).toBe(
      COUNTERS_GARDEN_ALL
    );
  });

  it('keeps a document it wrote itself', () => {
    expect(countersOptions({ photos: true, garden: 'g2' })).toEqual({
      photos: true,
      garden: 'g2',
    });
  });
});

describe('resolveCountersGarden — one owner for the fallback (round 1, E8)', () => {
  /** Only the id is read; the widget and the panel both pass their real list. */
  const list = (...ids: string[]) => ids.map((id) => ({ id }));

  // The rule used to exist twice: `CountersOptionsPanel` for its select and
  // `CountersBlock` for its list. Two owners of one contract have to agree for
  // the select and the rows to describe the same state, and nothing made them.
  it('keeps a garden that still exists', () => {
    expect(resolveCountersGarden('g2', list('g1', 'g2'))).toBe('g2');
  });

  it('falls back to « all » for a garden that has been deleted', () => {
    // MUI draws an unmatched select value as an empty box the reader cannot
    // read, and a list filtered on a garden that is gone is empty with no chip
    // left to clear it. Both are the same defect and both are answered here.
    expect(resolveCountersGarden('gone', list('g1', 'g2'))).toBe(
      COUNTERS_GARDEN_ALL
    );
  });

  it('leaves the « all » sentinel alone, whatever gardens exist', () => {
    expect(resolveCountersGarden(COUNTERS_GARDEN_ALL, list('g1'))).toBe(
      COUNTERS_GARDEN_ALL
    );
    expect(resolveCountersGarden(COUNTERS_GARDEN_ALL, list())).toBe(
      COUNTERS_GARDEN_ALL
    );
  });

  it('falls back when the user has no garden at all', () => {
    expect(resolveCountersGarden('g1', list())).toBe(COUNTERS_GARDEN_ALL);
  });
});

// ROUND 6 (partie A) — every figure the widget states, from one filter.
describe('resolveCountersFigures — one resolver for every number (round 6, A)', () => {
  const garden = (
    id: string,
    placements: DashboardGardenData['placements']
  ): DashboardGardenData => ({
    id,
    name: id,
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
    placements,
    placementCount: placements.length,
    varietyCount: new Set(placements.map((p) => p.plantId)).size,
    occupiedCells: placements.length,
    isEdible: null,
  });

  const variety = (
    plantId: string,
    count: number,
    gardenIds: string[]
  ): DashboardVarietyData => ({
    plantId,
    scientificName: plantId,
    commonName: null,
    plantType: null,
    isEdible: null,
    imageUrl: null,
    imageAttribution: null,
    count,
    cells: count,
    gardenIds,
  });

  // Basil once on the terrace and twice on the balcony; thyme twice on the
  // terrace only. Page-wide: 5 placements, 2 distinct varieties.
  const terrace = garden('g1', [
    placement({ id: 'a', plantId: 'basil' }),
    placement({ id: 'b', plantId: 'thyme', startCol: 1 }),
    placement({ id: 'c', plantId: 'thyme', startCol: 2, spanCols: 2 }),
  ]);
  const balcony = garden('g2', [
    placement({ id: 'd', plantId: 'basil' }),
    placement({ id: 'e', plantId: 'basil', startCol: 1 }),
  ]);
  const gardens = [terrace, balcony];
  const varieties = [
    variety('basil', 3, ['g1', 'g2']),
    variety('thyme', 2, ['g1']),
  ];
  const totals = {
    gardenCount: 2,
    placementCount: 5,
    varietyCount: 2,
    catalogPlantCount: 536,
  };

  it('states the page totals and the aggregate counts with no filter', () => {
    const figures = resolveCountersFigures(null, gardens, varieties, totals);

    expect(figures.garden).toBe(COUNTERS_GARDEN_ALL);
    expect(figures.placementCount).toBe(5);
    expect(figures.varietyCount).toBe(2);
    expect(figures.varieties.map((v) => [v.plantId, v.count])).toEqual([
      ['basil', 3],
      ['thyme', 2],
    ]);
  });

  it('re-states every figure for the selected garden alone', () => {
    // The family defect: the list was filtered and the numbers were not. On
    // the balcony, basil is « × 2 » and not « × 3 », there are 2 placements
    // and not 5, and one variety and not two.
    const figures = resolveCountersFigures(
      { garden: 'g2' },
      gardens,
      varieties,
      totals
    );

    expect(figures.garden).toBe('g2');
    expect(figures.placementCount).toBe(2);
    expect(figures.varietyCount).toBe(1);
    expect(figures.varieties.map((v) => [v.plantId, v.count, v.cells])).toEqual([
      ['basil', 2, 2],
    ]);
  });

  it('derives cells from the garden’s own footprints, like the count', () => {
    // Thyme on the terrace: two placements, one of them 1 × 2 — three cells.
    const figures = resolveCountersFigures(
      { garden: 'g1' },
      gardens,
      varieties,
      totals
    );

    expect(figures.varieties.find((v) => v.plantId === 'thyme')).toMatchObject({
      count: 2,
      cells: 3,
    });
    expect(figures.varieties.find((v) => v.plantId === 'basil')).toMatchObject({
      count: 1,
      cells: 1,
    });
  });

  it('falls back to the page when the stored garden is gone (round 1, E8)', () => {
    const figures = resolveCountersFigures(
      { garden: 'gone' },
      gardens,
      varieties,
      totals
    );

    expect(figures.garden).toBe(COUNTERS_GARDEN_ALL);
    expect(figures.placementCount).toBe(5);
    expect(figures.varietyCount).toBe(2);
  });

  it('never writes into the caller’s varieties', () => {
    const before = varieties.map((v) => v.count);
    resolveCountersFigures({ garden: 'g2' }, gardens, varieties, totals);

    expect(varieties.map((v) => v.count)).toEqual(before);
  });
});
