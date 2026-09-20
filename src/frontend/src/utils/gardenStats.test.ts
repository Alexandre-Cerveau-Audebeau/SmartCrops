import { describe, expect, it } from 'vitest';
import { gardenFixture } from '../test/fixtures/dashboard';
import { gardenToPreview } from './gardenPreview';
import { at, placement } from '../test/fixtures/placements';
import type { DashboardGardenData } from '../types/DashboardData';
import { parseCellsJson, type CellData } from '../types/GardenLayout';
import type { ExposureCategory } from './exposure';
import {
  clipPlacement,
  deriveGardenView,
  placementCoverage,
  placementExposure,
  gardenViewOf,
  dominantExposure,
  emptyExposureTally,
  exposureTally,
  freeCellExposureTally,
  freeCells,
  gridStats,
  isEdibleVariety,
  isOrnamentalGarden,
  occupancyPercent,
  sumExposureTallies,
} from './gardenStats';

// SMA-336 PR 2/5 — the figures the Gardens and Statistics widgets show, and the
// edible rule the Counters widget splits on.

describe('gridStats', () => {
  it('counts active and total cells, and turns the active ones into square metres', () => {
    const grid: CellData[][] = [
      [{ active: true }, { active: true }],
      [{ active: false }, { active: true }],
    ];

    // Three active cells of 50 cm → 3 × 0.25 m².
    expect(gridStats(grid, '50cm')).toEqual({
      activeCells: 3,
      totalCells: 4,
      surfaceM2: 0.75,
    });
  });

  it('reads each cell size', () => {
    const grid: CellData[][] = [[{ active: true }, { active: true }]];

    expect(gridStats(grid, '1m').surfaceM2).toBe(2);
    expect(gridStats(grid, '50cm').surfaceM2).toBe(0.5);
    expect(gridStats(grid, '25cm').surfaceM2).toBe(0.125);
  });

  it('answers zeros for a garden with no grid at all', () => {
    expect(gridStats(null, '50cm')).toEqual({
      activeCells: 0,
      totalCells: 0,
      surfaceM2: 0,
    });
  });

  it('falls back to the smallest cell when the size is missing', () => {
    // cellSizeToMeters treats anything it does not know as 25 cm; a garden with
    // no stored size must not throw, and must not silently claim metres.
    const grid: CellData[][] = [[{ active: true }]];

    expect(gridStats(grid, null).surfaceM2).toBe(0.0625);
  });

  it('reads a real stored plan through parseCellsJson', () => {
    const json = JSON.stringify([
      { row: 0, col: 0, active: false },
      { row: 0, col: 1, soil: 'humus' },
    ]);

    // 2 × 2 grid, one cell switched off: three plantable.
    expect(gridStats(parseCellsJson(json, 2, 2), '50cm').activeCells).toBe(3);
  });
});

describe('freeCells', () => {
  it('is what is active and unplanted', () => {
    expect(freeCells(100, 32)).toBe(68);
  });

  it('never goes negative', () => {
    // The layout PUT validates neither overlap nor placing on an inactive cell,
    // so more plant cells than active ones is storable — and « −4 free » would
    // read as a bug in the widget rather than in the data.
    expect(freeCells(10, 14)).toBe(0);
  });
});

describe('occupancyPercent', () => {
  it('is a share of the PLANTABLE cells', () => {
    expect(occupancyPercent(152, 124)).toBe(82);
    expect(occupancyPercent(4, 1)).toBe(25);
  });

  it('is 0 when nothing is plantable, not a division by zero', () => {
    expect(occupancyPercent(0, 0)).toBe(0);
    expect(occupancyPercent(0, 7)).toBe(0);
  });

  it('caps at 100', () => {
    expect(occupancyPercent(10, 14)).toBe(100);
  });
});

describe('exposureTally', () => {
  const cells: (ExposureCategory | null)[][] = [
    ['full', 'full', null],
    ['morning', 'shade', 'full'],
  ];

  it('counts the rated cells by category', () => {
    expect(exposureTally(cells)).toEqual({
      full: 3,
      morning: 1,
      afternoon: 0,
      shade: 1,
    });
  });

  it('ignores unrated cells — the engine returns null for an inactive one', () => {
    expect(exposureTally(cells).full + exposureTally(cells).morning).toBe(4);
  });

  it('answers a zeroed tally when the engine produced nothing', () => {
    expect(exposureTally(null)).toEqual(emptyExposureTally());
  });

  it('hands out a fresh tally each time', () => {
    // Read the mutated object BACK (round 6, Extension #4-22): each call
    // returns a distinct object, and a write to one never reaches the next.
    const first = emptyExposureTally();
    first.full = 9;
    const second = emptyExposureTally();

    expect(second).not.toBe(first);
    expect(second.full).toBe(0);
    expect(first.full).toBe(9);
  });
});

describe('dominantExposure', () => {
  it('is the category with the most cells', () => {
    expect(
      dominantExposure({ full: 2, morning: 9, afternoon: 1, shade: 0 })
    ).toBe('morning');
  });

  it('breaks a tie the same way every time, sunniest first', () => {
    // Not « whichever key enumerates first »: the same garden must not report
    // full on one load and shade on the next.
    expect(
      dominantExposure({ full: 5, morning: 5, afternoon: 5, shade: 5 })
    ).toBe('full');
    expect(
      dominantExposure({ full: 0, morning: 4, afternoon: 4, shade: 4 })
    ).toBe('morning');
  });

  it('is null when nothing is rated', () => {
    expect(dominantExposure(emptyExposureTally())).toBeNull();
  });
});

describe('freeCellExposureTally', () => {
  const cells: (ExposureCategory | null)[][] = [
    ['full', 'full', 'full'],
    ['full', 'shade', 'shade'],
  ];

  it('counts only the cells no plant covers', () => {
    const tally = freeCellExposureTally(
      cells,
      [placement({ startRow: 0, startCol: 0 })],
      2,
      3
    );

    expect(tally).toEqual({ full: 3, morning: 0, afternoon: 0, shade: 2 });
  });

  it('walks a multi-cell footprint', () => {
    const tally = freeCellExposureTally(
      cells,
      [placement({ startRow: 0, startCol: 0, spanRows: 2, spanCols: 2 })],
      2,
      3
    );

    // The 2 × 2 block covers (0,0) (0,1) (1,0) (1,1): one full and one shade left.
    expect(tally).toEqual({ full: 1, morning: 0, afternoon: 0, shade: 1 });
  });

  it('ignores a footprint that runs off the grid instead of throwing', () => {
    const tally = freeCellExposureTally(
      cells,
      [placement({ startRow: 1, startCol: 2, spanRows: 4, spanCols: 4 })],
      2,
      3
    );

    expect(tally).toEqual({ full: 4, morning: 0, afternoon: 0, shade: 1 });
  });

  it('answers a zeroed tally when the engine produced nothing', () => {
    expect(freeCellExposureTally(null, [], 2, 3)).toEqual(emptyExposureTally());
  });
});

describe('isEdibleVariety — rule R4', () => {
  // The four cases measured on the real catalog. Neither signal alone works:
  // 31 Vegetable/Fruit/Herb plants carry isEdible false, and 38 Ornamental
  // plants carry isEdible true.
  it('trusts the type when the flag disagrees', () => {
    expect(isEdibleVariety({ plantType: 'Vegetable', isEdible: false })).toBe(true);
    expect(isEdibleVariety({ plantType: 'Herb', isEdible: false })).toBe(true);
    expect(isEdibleVariety({ plantType: 'Fruit', isEdible: false })).toBe(true);
  });

  it('trusts the flag when the type says ornamental', () => {
    expect(isEdibleVariety({ plantType: 'Ornamental', isEdible: true })).toBe(true);
  });

  it('says no when neither says yes', () => {
    expect(isEdibleVariety({ plantType: 'Ornamental', isEdible: false })).toBe(false);
    expect(isEdibleVariety({ plantType: 'Medicinal', isEdible: false })).toBe(false);
  });

  it('lets the type decide alone when the flag is missing', () => {
    // isEdible is null on 12 catalog rows; the type is filled on all 536.
    expect(isEdibleVariety({ plantType: 'Ornamental', isEdible: null })).toBe(false);
    expect(isEdibleVariety({ plantType: 'Vegetable', isEdible: null })).toBe(true);
  });

  it('says no when neither field is known', () => {
    expect(isEdibleVariety({ plantType: null, isEdible: null })).toBe(false);
  });
});

describe('isOrnamentalGarden', () => {
  it('is true only when every variety is ornamental', () => {
    expect(
      isOrnamentalGarden([
        { plantType: 'Ornamental', isEdible: false },
        { plantType: 'Ornamental', isEdible: null },
      ])
    ).toBe(true);
  });

  it('is false as soon as ONE variety is edible', () => {
    // Calling this garden ornamental would hide a real harvest; the reverse
    // mistake only shows an empty one.
    expect(
      isOrnamentalGarden([
        { plantType: 'Ornamental', isEdible: false },
        { plantType: 'Ornamental', isEdible: false },
        { plantType: 'Herb', isEdible: false },
      ])
    ).toBe(false);
  });

  it('is NULL for a garden with no variety at all', () => {
    // Not true: an unplanted garden is neither, and calling it ornamental would
    // apply « never shows a harvest » to a garden nobody has planted yet.
    expect(isOrnamentalGarden([])).toBeNull();
  });
});

describe('deriveGardenView', () => {
  // On the shared builder (round 7, S10 — Extension #6-22 / #8-17): the
  // sixteen-field record was spelled out three times in this file. Kept here:
  // 4 × 2 and oriented south — the height and the orientation are what these
  // cases are about.
  const garden = (
    over: Partial<DashboardGardenData> = {}
  ): DashboardGardenData =>
    gardenFixture({
      height: 2,
      config: {
        orientation: 'S',
        gardenType: null,
        lightSchedule: null,
        hemisphere: 'N',
        latitudeBand: 'mid',
      },
      ...over,
    });

  it('reads the plan the server transported, without the server having parsed it', () => {
    // ADAPTED by round 3 (E″9). It used to hand `occupiedCells: 2` on the
    // transport and NO placements, because the view read the server's footprint
    // sum. It reads the plan now, so the two occupied cells have to be in the
    // plan — which is the point of the finding, and the same figures follow.
    const view = deriveGardenView(
      garden({
        cellsJson: JSON.stringify([{ row: 0, col: 0, active: false }]),
        occupiedCells: 2,
        placements: [
          placement({ startRow: 0, startCol: 1 }),
          placement({ startRow: 0, startCol: 2 }),
        ],
      })
    );

    expect(view.hasPlan).toBe(true);
    expect(view.totalCells).toBe(8);
    expect(view.activeCells).toBe(7);
    expect(view.surfaceM2).toBeCloseTo(1.75);
    expect(view.occupiedCells).toBe(2);
    expect(view.freeCells).toBe(5);
    expect(view.occupancyPercent).toBe(29);
  });

  it('rates every active cell and none of the inactive ones', () => {
    const view = deriveGardenView(
      garden({ cellsJson: JSON.stringify([{ row: 0, col: 0, active: false }]) })
    );
    const rated =
      view.exposure.full +
      view.exposure.morning +
      view.exposure.afternoon +
      view.exposure.shade;

    expect(rated).toBe(view.activeCells);
    expect(view.dominantExposure).not.toBeNull();
  });

  it('answers the same thing twice — no clock anywhere in the chain', () => {
    // Decision D12 is what makes this true: season and moment are fixed, so the
    // figure cannot move between two loads, nor between two runs of this test.
    const first = deriveGardenView(garden());
    const second = deriveGardenView(garden());

    expect(first).toEqual(second);
  });

  it('reports NO plan for a garden whose layout was never saved', () => {
    const view = deriveGardenView(garden({ width: null, height: null }));

    expect(view.hasPlan).toBe(false);
    expect(view.activeCells).toBe(0);
    expect(view.surfaceM2).toBe(0);
    expect(view.dominantExposure).toBeNull();
    expect(view.exposure).toEqual(emptyExposureTally());
    // No plan, no grid — not an empty grid, which would read as a rated plan
    // with zero cells (SMA-336 PR 4b/5, decision T2).
    expect(view.cells).toBeNull();
    expect(view.momentsLit).toBeNull();
  });

  it('carries the grid its tallies were counted from (PR 4b/5, T2)', () => {
    // The Tips widget reads a cell off `view.cells`; the Statistics widget
    // reads `view.exposure`. Same pass, so the tally IS the count of the grid.
    const view = deriveGardenView(
      garden({ cellsJson: JSON.stringify([{ row: 0, col: 0, active: false }]) })
    );
    const counted = emptyExposureTally();
    for (const row of view.cells!) {
      for (const category of row) {
        if (category) counted[category] += 1;
      }
    }

    expect(view.cells).toHaveLength(2); // rows
    expect(view.cells![0]).toHaveLength(4); // cols
    expect(view.cells![0]![0]).toBeNull(); // the switched-off cell
    expect(counted).toEqual(view.exposure);
    // The moment triplets are aligned with the cells: null exactly where the
    // category did not come from the sun path — here, the inactive cell.
    expect(view.momentsLit).toHaveLength(2);
    expect(view.momentsLit![0]![0]).toBeNull();
    expect(view.momentsLit![0]![1]).toEqual({
      morning: true,
      noon: true,
      evening: true,
    });
  });

  it('subtracts the placement footprints from the free-cell tally', () => {
    const view = deriveGardenView(
      garden({
        occupiedCells: 4,
        placements: [
          placement({ startRow: 0, startCol: 0, spanRows: 2, spanCols: 2 }),
        ],
      })
    );
    const free =
      view.freeExposure.full +
      view.freeExposure.morning +
      view.freeExposure.afternoon +
      view.freeExposure.shade;

    expect(free).toBe(4);
    // And it IS the free-cell count: the sunny figure the Statistics widget
    // prints is a share of the free cells, never an independent count (round
    // 7, S47 — the French « dont » states this relation).
    expect(free).toBe(view.freeCells);
    expect(view.freeExposure.full).toBeLessThanOrEqual(view.freeCells);
  });
});

describe('sumExposureTallies', () => {
  it('adds the categories across gardens', () => {
    expect(
      sumExposureTallies([
        { full: 1, morning: 2, afternoon: 0, shade: 3 },
        { full: 4, morning: 0, afternoon: 5, shade: 0 },
      ])
    ).toEqual({ full: 5, morning: 2, afternoon: 5, shade: 3 });
  });

  it('answers a zeroed tally for no garden at all', () => {
    expect(sumExposureTallies([])).toEqual(emptyExposureTally());
  });
});

describe('gardenViewOf — one derivation per garden (round 1, E10 / G4 / E22)', () => {
  const plannedGarden = (): DashboardGardenData =>
    gardenFixture({
      height: 2,
      config: {
        orientation: 'S',
        gardenType: null,
        lightSchedule: null,
        hemisphere: 'N',
        latitudeBand: 'mid',
      },
      placements: [placement()],
      placementCount: 1,
      varietyCount: 1,
      occupiedCells: 1,
      isEdible: true,
    });

  it('answers the identical object on a second call', () => {
    // Reference equality is the measurement: `deriveGardenView` allocates a new
    // GardenView, several grids and two tallies every time it runs, so the same
    // reference coming back proves the engine did not run again.
    const garden = plannedGarden();

    expect(gardenViewOf(garden)).toBe(gardenViewOf(garden));
  });

  it('agrees with the unmemoized derivation', () => {
    const garden = plannedGarden();

    expect(gardenViewOf(garden)).toEqual(deriveGardenView(garden));
  });

  it('derives again for a different garden object', () => {
    // The cache key is the object `useDashboardData` built, and a new fetch
    // builds new objects — so new data is never served from the cache, however
    // identical it looks.
    const first = plannedGarden();
    const second = plannedGarden();

    expect(gardenViewOf(first)).not.toBe(gardenViewOf(second));
    expect(gardenViewOf(first)).toEqual(gardenViewOf(second));
  });
});

// ── Round 3 (E″9 / G″6): every occupancy figure from ONE coverage ────────────

describe('placementCoverage — the single source of every occupancy figure', () => {
  const cells: (ExposureCategory | null)[][] = [
    ['full', 'full', 'full'],
    ['full', null, 'shade'],
  ];

  it('counts an overlapped cell ONCE', () => {
    // The case the finding names: the server's Σ spanRows × spanCols would say
    // two, and there is one cell under both plants.
    const coverage = placementCoverage(
      cells,
      [
        placement({ startRow: 0, startCol: 0 }),
        placement({ startRow: 0, startCol: 0 }),
      ],
      2,
      3
    );

    expect(coverage.occupiedCells).toBe(1);
    expect(coverage.taken[0]![0]).toBe(true);
  });

  it('clips a footprint that runs off the plan', () => {
    const coverage = placementCoverage(
      cells,
      [placement({ startRow: 1, startCol: 2, spanRows: 4, spanCols: 4 })],
      2,
      3
    );

    // Only (1,2) is inside the 2 × 3 plan.
    expect(coverage.occupiedCells).toBe(1);
  });

  it('does not count a plant sitting on a switched-off cell', () => {
    // (1,1) is unrated, so it is not surface: covering it occupies nothing the
    // garden could otherwise have used.
    const coverage = placementCoverage(
      cells,
      [placement({ startRow: 1, startCol: 1 })],
      2,
      3
    );

    expect(coverage.occupiedCells).toBe(0);
    expect(coverage.taken[1]![1]).toBe(true);
  });

  it('is zero when the engine rated nothing', () => {
    const coverage = placementCoverage(null, [placement()], 2, 3);

    expect(coverage.occupiedCells).toBe(0);
  });
});

describe('deriveGardenView — the figures agree with each other (E″9 / G″6)', () => {
  const gardenWith = (
    over: Partial<DashboardGardenData> = {}
  ): DashboardGardenData =>
    gardenFixture({
      height: 2,
      config: {
        orientation: 'S',
        gardenType: null,
        lightSchedule: null,
        hemisphere: 'N',
        latitudeBand: 'mid',
      },
      ...over,
    });

  /** Every case below must satisfy the same three identities. */
  const expectConsistent = (view: ReturnType<typeof deriveGardenView>) => {
    expect(view.occupiedCells + view.freeCells).toBe(view.activeCells);
    expect(view.occupancyPercent).toBe(
      view.activeCells === 0
        ? 0
        : Math.round((view.occupiedCells / view.activeCells) * 100)
    );
    const freeRated =
      view.freeExposure.full +
      view.freeExposure.morning +
      view.freeExposure.afternoon +
      view.freeExposure.shade;
    expect(freeRated).toBe(view.freeCells);
  };

  it('two overlapping plants on one of two active cells — 50 %, not 100 %', () => {
    // The exact contradiction the finding describes. The transport says four
    // occupied cells (two 1 × 1 placements counted twice over, plus the sum of
    // spans); the plan says one cell is taken and one is free.
    const view = deriveGardenView(
      gardenWith({
        width: 2,
        height: 1,
        cellsJson: JSON.stringify([{ row: 0, col: 0, active: true }]),
        occupiedCells: 2,
        placements: [
          placement({ startRow: 0, startCol: 0 }),
          placement({ startRow: 0, startCol: 0 }),
        ],
      })
    );

    expect(view.activeCells).toBe(2);
    expect(view.occupiedCells).toBe(1);
    expect(view.freeCells).toBe(1);
    expect(view.occupancyPercent).toBe(50);
    expectConsistent(view);
  });

  it('a footprint anchored outside the plan cannot push occupancy past the plan', () => {
    const view = deriveGardenView(
      gardenWith({
        occupiedCells: 16,
        placements: [
          placement({ startRow: 1, startCol: 3, spanRows: 4, spanCols: 4 }),
        ],
      })
    );

    // The 4 × 4 footprint has ONE cell inside a 4 × 2 plan.
    expect(view.occupiedCells).toBe(1);
    expectConsistent(view);
  });

  it('a plant on a switched-off cell occupies nothing', () => {
    const view = deriveGardenView(
      gardenWith({
        cellsJson: JSON.stringify([{ row: 0, col: 0, active: false }]),
        occupiedCells: 1,
        placements: [placement({ startRow: 0, startCol: 0 })],
      })
    );

    expect(view.activeCells).toBe(7);
    expect(view.occupiedCells).toBe(0);
    expect(view.freeCells).toBe(7);
    expect(view.occupancyPercent).toBe(0);
    expectConsistent(view);
  });

  it('holds for a plain garden with no placement at all', () => {
    expectConsistent(deriveGardenView(gardenWith()));
  });

  it('holds when every active cell is covered', () => {
    const view = deriveGardenView(
      gardenWith({
        placements: [
          placement({ startRow: 0, startCol: 0, spanRows: 2, spanCols: 4 }),
        ],
      })
    );

    expect(view.occupiedCells).toBe(8);
    expect(view.freeCells).toBe(0);
    expect(view.occupancyPercent).toBe(100);
    expectConsistent(view);
  });

  it('a garden with no plan reports no occupancy rather than the transport count', () => {
    const view = deriveGardenView(
      gardenWith({ width: null, height: null, occupiedCells: 12 })
    );

    expect(view.hasPlan).toBe(false);
    expect(view.occupiedCells).toBe(0);
    expectConsistent(view);
  });
});

// ROUND 7 (S41 — Extension #7-27) — one clip, two consumers.
describe('clipPlacement', () => {
  it('cuts a footprint at the plan’s edges and drops one that lands outside', () => {
    expect(
      clipPlacement(placement({ startRow: -1, startCol: 2, spanRows: 3, spanCols: 4 }), 3, 4)
    ).toEqual({ row: 0, col: 2, spanRows: 2, spanCols: 2 });
    expect(clipPlacement(placement({ startRow: 5, startCol: 0 }), 3, 4)).toBeNull();
    expect(clipPlacement(placement({ startRow: 0, startCol: 0 }), 3, 4)).toEqual({
      row: 0,
      col: 0,
      spanRows: 1,
      spanCols: 1,
    });
  });

  it('is the footprint the thumbnail draws AND the one occupancy counts', () => {
    // The two masks used to implement the same clamp on their own; relax or
    // tighten one alone and the widget reports a figure its picture
    // contradicts. Both read this helper now, so a placement crossing the edge
    // is drawn exactly as wide as it is counted.
    const crossing = placement({ startRow: 1, startCol: 2, spanRows: 4, spanCols: 4 });
    const drawn = gardenToPreview(null, 4, 3, [crossing]).placements;
    const counted = placementCoverage(
      parseCellsJson(null, 4, 3).map((row) => row.map(() => 'full' as const)),
      [crossing],
      3,
      4
    );

    expect(drawn).toEqual([{ plantKey: crossing.plantId, row: 1, col: 2, spanRows: 2, spanCols: 2 }]);
    expect(counted.occupiedCells).toBe(2 * 2);
  });
});

describe('placementExposure — one cell, the anchor (PR 4b/5, T3)', () => {
  // A drawn 4 × 3 garden oriented south, in the northern hemisphere at mid
  // latitude: with nothing in the way, every cell is lit at all three moments.
  const garden = (
    over: Partial<DashboardGardenData> = {}
  ): DashboardGardenData =>
    gardenFixture({
      config: {
        orientation: 'S',
        gardenType: null,
        lightSchedule: null,
        hemisphere: 'N',
        latitudeBand: 'mid',
      },
      ...over,
    });

  // A tall wall on the bottom-left cell. Oriented south, the evening sun sits
  // in the west and a summer shadow of two cells runs east along the bottom
  // row; the noon sun sits in the south and the shadow runs up the first
  // column. These are the engine's own rules (`exposure.ts`), read here, not
  // restated: the point is that the view carries what the engine said.
  const walled = () =>
    garden({
      cellsJson: JSON.stringify([{ row: 2, col: 0, infrastructure: 'wall' }]),
    });

  it('reads the anchor’s category and moments off the view — never a default', () => {
    const view = deriveGardenView(garden());

    expect(placementExposure(view, at(1, 2))).toEqual({
      row: 1,
      col: 2,
      category: 'full',
      momentsLit: { morning: true, noon: true, evening: true },
    });
  });

  it('says WHEN the anchor is shaded, from the engine’s triplet', () => {
    const view = deriveGardenView(walled());

    // East of the wall: lit in the morning and at noon, shaded in the evening
    // — the « shaded in the afternoon » a tip would print.
    expect(placementExposure(view, at(2, 1))).toEqual({
      row: 2,
      col: 1,
      category: 'morning',
      momentsLit: { morning: true, noon: true, evening: false },
    });
    // Above the wall: the noon sun is blocked, and noon decides the category.
    expect(placementExposure(view, at(1, 0))).toEqual({
      row: 1,
      col: 0,
      category: 'shade',
      momentsLit: { morning: true, noon: false, evening: true },
    });
    // Out of both shadows: nothing changed for that cell.
    expect(placementExposure(view, at(0, 3))?.category).toBe('full');
  });

  it('judges the anchor cell, not the rest of the footprint', () => {
    const view = deriveGardenView(walled());

    // A 1 × 3 footprint anchored on the shaded cell and running into the sun:
    // the verdict is the anchor's, the cell the sentence will name.
    const straddling = placement({ startRow: 2, startCol: 1, spanRows: 1, spanCols: 3 });

    expect(placementExposure(view, straddling)?.category).toBe('morning');
    expect(placementExposure(view, straddling)?.col).toBe(1);
  });

  it('clips an anchor outside the plan to the first cell inside — the same clip as coverage', () => {
    const view = deriveGardenView(garden());
    const hanging = placement({ startRow: -1, startCol: -2, spanRows: 2, spanCols: 3 });

    const exposure = placementExposure(view, hanging);

    // Judged on (0, 0): the cell `placementCoverage` counted and the thumbnail
    // drew for this placement, not on a cell that does not exist.
    expect(exposure?.row).toBe(0);
    expect(exposure?.col).toBe(0);
    expect(clipPlacement(hanging, 3, 4)).toMatchObject({ row: 0, col: 0 });
  });

  it('is null for a footprint that lands entirely outside the plan', () => {
    const view = deriveGardenView(garden());

    expect(placementExposure(view, at(3, 0))).toBeNull(); // one row past the bottom
    expect(placementExposure(view, at(0, 4))).toBeNull(); // one column past the right
    expect(placementExposure(view, placement({ startRow: -1, startCol: 0 }))).toBeNull();
  });

  it('is null for a garden with no plan', () => {
    const view = deriveGardenView(garden({ width: null, height: null }));

    expect(view.hasPlan).toBe(false);
    expect(placementExposure(view, at(0, 0))).toBeNull();
  });

  it('is null on a cell the user switched off — no exposure is known there', () => {
    const view = deriveGardenView(
      garden({ cellsJson: JSON.stringify([{ row: 1, col: 1, active: false }]) })
    );

    // The engine rates an inactive cell null, and a plant sitting on one gets
    // no verdict rather than a made-up one.
    expect(placementExposure(view, at(1, 1))).toBeNull();
    expect(placementExposure(view, at(1, 2))).not.toBeNull();
  });

  it('keeps a manual override’s category, with no moments to explain it', () => {
    const view = deriveGardenView(
      garden({
        cellsJson: JSON.stringify([{ row: 0, col: 0, exposureOverride: 'shade' }]),
      })
    );

    // The user said « shade »; the physical triplet would contradict the
    // label, so the engine withholds it (SMA-309) and so does the view.
    expect(placementExposure(view, at(0, 0))).toEqual({
      row: 0,
      col: 0,
      category: 'shade',
      momentsLit: null,
    });
  });

  it('reads the memoized view without deriving again', () => {
    const data = walled();
    const view = gardenViewOf(data);

    expect(placementExposure(view, at(2, 1))).toEqual(
      placementExposure(gardenViewOf(data), at(2, 1))
    );
    expect(gardenViewOf(data)).toBe(view);
  });
});
