import { describe, expect, it } from 'vitest';
import type { PlacementData } from '../services/gardenLayoutApi';
import type { DashboardGardenData } from '../types/DashboardData';
import { parseCellsJson, type CellData } from '../types/GardenLayout';
import type { ExposureCategory } from './exposure';
import {
  deriveGardenView,
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

const placement = (over: Partial<PlacementData> = {}): PlacementData => ({
  id: 'pl-1',
  plantId: 'plant-1',
  plantScientificName: 'Ocimum basilicum',
  startRow: 0,
  startCol: 0,
  spanRows: 1,
  spanCols: 1,
  notes: null,
  ...over,
});

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
    const first = emptyExposureTally();
    first.full = 9;

    expect(emptyExposureTally().full).toBe(0);
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
  const garden = (
    over: Partial<DashboardGardenData> = {}
  ): DashboardGardenData => ({
    id: 'g1',
    name: 'Terrasse',
    description: null,
    width: 4,
    height: 2,
    cellSize: '50cm',
    cellsJson: null,
    config: {
      orientation: 'S',
      gardenType: null,
      lightSchedule: null,
      hemisphere: 'N',
      latitudeBand: 'mid',
    },
    updatedAt: '2026-05-01T00:00:00Z',
    placements: [],
    placementCount: 0,
    varietyCount: 0,
    occupiedCells: 0,
    isEdible: null,
    ...over,
  });

  it('reads the plan the server transported, without the server having parsed it', () => {
    const view = deriveGardenView(
      garden({
        cellsJson: JSON.stringify([{ row: 0, col: 0, active: false }]),
        occupiedCells: 2,
      })
    );

    expect(view.hasPlan).toBe(true);
    expect(view.totalCells).toBe(8);
    expect(view.activeCells).toBe(7);
    expect(view.surfaceM2).toBeCloseTo(1.75);
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
  });

  it('subtracts the placement footprints from the free-cell tally', () => {
    const view = deriveGardenView(
      garden({
        occupiedCells: 4,
        placements: [
          {
            id: 'pl-1',
            plantId: 'p-1',
            plantScientificName: null,
            startRow: 0,
            startCol: 0,
            spanRows: 2,
            spanCols: 2,
            notes: null,
          },
        ],
      })
    );
    const free =
      view.freeExposure.full +
      view.freeExposure.morning +
      view.freeExposure.afternoon +
      view.freeExposure.shade;

    expect(free).toBe(4);
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
  const plannedGarden = (): DashboardGardenData => ({
    id: 'g1',
    name: 'Terrasse',
    description: null,
    width: 4,
    height: 2,
    cellSize: '50cm',
    cellsJson: null,
    config: {
      orientation: 'S',
      gardenType: null,
      lightSchedule: null,
      hemisphere: 'N',
      latitudeBand: 'mid',
    },
    updatedAt: '2026-05-01T00:00:00Z',
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
