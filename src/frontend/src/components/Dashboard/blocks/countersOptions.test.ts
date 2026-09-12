import { describe, expect, it } from 'vitest';
import type {
  DashboardGardenData,
  DashboardVarietyData,
} from '../../../types/DashboardData';
import { gardenFixture } from '../../../test/fixtures/dashboard';
import { placement } from '../../../test/fixtures/placements';
import {
  COUNTERS_GARDEN_ALL,
  COUNTERS_LINE_CAP,
  COUNTERS_LIST,
  countersOptions,
  worstCaseLines,
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
  // On the shared builder, with the three derived fields as the overrides
  // that carry meaning (round 7, S15 — Extension #6-8 / #6-9). `occupiedCells`
  // is the SUM OF FOOTPRINTS, as the server computes it — not the placement
  // count: placement `c` below spans 1 × 2, so the terrace holds four occupied
  // cells for three placements.
  const garden = (
    id: string,
    placements: DashboardGardenData['placements']
  ): DashboardGardenData =>
    gardenFixture({
      id,
      name: id,
      placements,
      placementCount: placements.length,
      varietyCount: new Set(placements.map((p) => p.plantId)).size,
      occupiedCells: placements.reduce(
        (sum, p) => sum + p.spanRows * p.spanCols,
        0
      ),
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
    // `count` AND `cells` (round 7, S32 — Extension #7-14): the resolver
    // re-states both per garden, and a guard that sampled `count` alone would
    // have let an in-place write of `cells` through.
    const before = varieties.map((v) => [v.count, v.cells]);
    resolveCountersFigures({ garden: 'g2' }, gardens, varieties, totals);

    expect(varieties.map((v) => [v.count, v.cells])).toEqual(before);
  });

  // ROUND 7 — the 🟠 Major inline of `556f0d0` (`countersOptions.ts` L168)
  // and Extension #6-10 / #6-11 (S16): the placements are indexed ONCE.
  it('walks the garden’s placements once, however many varieties it keeps', () => {
    // A garden of two hundred placements over fifty varieties: the per-variety
    // filter read the array fifty times — ten thousand element visits for a
    // list the widget resolves on every render. Counted through a proxy, so
    // the assertion is on the shape of the work and not on a timing.
    const many = Array.from({ length: 50 }, (_, index) => `plant-${index}`);
    const placements = Array.from({ length: 200 }, (_, index) =>
      placement({
        id: `pl-${index}`,
        plantId: many[index % many.length]!,
        startRow: 0,
        startCol: index,
      })
    );
    let visits = 0;
    const counted = new Proxy(placements, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) visits += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    // Built on the plain array (the builder reads it), then handed the proxy.
    const big = { ...garden('big', placements), placements: counted };
    const rows = many.map((plantId) => variety(plantId, 4, ['big']));

    const figures = resolveCountersFigures(
      { garden: 'big' },
      [big],
      rows,
      { gardenCount: 1, placementCount: 200, varietyCount: 50, catalogPlantCount: 536 }
    );

    expect(figures.varieties).toHaveLength(50);
    expect(figures.varieties.every((row) => row.count === 4 && row.cells === 4)).toBe(true);
    // One element read per placement — not one per placement per variety.
    expect(visits).toBeLessThanOrEqual(placements.length);
  });
});

// ROUND 6 (Extension #4-11) — the reader carries what it does not interpret.
describe('countersOptions — an unknown key survives a read (round 6)', () => {
  it('carries a key another build stored, beside the two it validates', () => {
    const read = countersOptions({ photos: true, garden: 'g2', density: 'compact' });

    expect(read).toEqual({ photos: true, garden: 'g2', density: 'compact' });
  });

  it('still corrects the two keys it owns, without losing the others', () => {
    const read = countersOptions({ photos: 'yes', garden: 42, later: { a: 1 } });

    expect(read.photos).toBe(false);
    expect(read.garden).toBe(COUNTERS_GARDEN_ALL);
    expect(read.later).toEqual({ a: 1 });
  });
});

// ROUND 7 (S29 — Extension #7-10) — one owner for the density lock and for the
// numbers that have to satisfy it.
describe('COUNTERS_LIST — what each size lists fits the lines its card allows', () => {
  it('holds, section split included, at both sizes', () => {
    // Two sections can each round a half-row up, so the worst case is
    // `ceil(a/c) + ceil(b/c)`: five lines for eight varieties over two columns,
    // and exactly ten for nineteen — nineteen is odd, so the two halves cannot
    // both round up. A change to either number that breaks the lock fails here
    // rather than in a scrolling card.
    const { medium, large } = COUNTERS_LIST;

    expect(worstCaseLines(medium.varieties, medium.columns)).toBeLessThanOrEqual(
      COUNTERS_LINE_CAP.medium
    );
    expect(worstCaseLines(large.varieties, large.columns)).toBeLessThanOrEqual(
      COUNTERS_LINE_CAP.large
    );
  });

  it('states the parity argument for what it is', () => {
    expect(worstCaseLines(8, 2)).toBe(5);
    expect(worstCaseLines(19, 2)).toBe(10);
    // Twenty over two columns would be eleven lines on a ten-line card.
    expect(worstCaseLines(20, 2)).toBe(11);
  });

  // ROUND 8 (Extension #9-15): the general case, at the bounds the closed
  // form of round 7 got wrong — it was exact for two columns only.
  it('is the maximum over every split, whatever the column count', () => {
    // Zero varieties are zero lines, not one.
    expect(worstCaseLines(0, 2)).toBe(0);
    expect(worstCaseLines(0, 1)).toBe(0);
    // One column: a line per variety, however they split.
    expect(worstCaseLines(1, 1)).toBe(1);
    expect(worstCaseLines(5, 1)).toBe(5);
    // Three columns: five split 1 / 4 take 1 + 2 = 3 lines (round 7 said 2);
    // four take 2 (1 / 3 → 1 + 1); six take 3 (1 / 5 → 1 + 2); two take 2
    // (1 / 1); one takes 1.
    expect(worstCaseLines(5, 3)).toBe(3);
    expect(worstCaseLines(4, 3)).toBe(2);
    expect(worstCaseLines(6, 3)).toBe(3);
    expect(worstCaseLines(2, 3)).toBe(2);
    expect(worstCaseLines(1, 3)).toBe(1);
  });

  it('agrees with the definition, brute-forced, for every count and column the widget could see', () => {
    // The definition: two sections, `first` and the rest, each rounding its
    // last line up, maximised over `first`.
    const bruteForce = (varieties: number, columns: number) =>
      Math.max(
        ...Array.from(
          { length: varieties + 1 },
          (_, first) =>
            Math.ceil(first / columns) +
            Math.ceil((varieties - first) / columns)
        )
      );
    for (let columns = 1; columns <= 4; columns++) {
      for (let varieties = 0; varieties <= 40; varieties++) {
        expect(worstCaseLines(varieties, columns)).toBe(
          bruteForce(varieties, columns)
        );
      }
    }
  });
});
