import { describe, expect, it } from 'vitest';
import type { CellData } from '../types/GardenLayout';
import { computeExposureGrid } from './exposure';
import {
  groupInfrastructureRegions,
  INFRA_META,
  INFRASTRUCTURE_TYPES,
  infrastructureBlockers,
  isInfrastructureType,
  type InfrastructureType,
} from './infrastructure';

// SMA-15 (5.4) — per-cell infrastructure grouped into rectangular regions:
// the §6 render blocks AND the exposure Blockers come from the same helper,
// so the drawn block and the cast shadow can never disagree.

const emptyGrid = (rows: number, cols: number): CellData[][] =>
  Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ active: true }) as CellData)
  );

const paint = (
  grid: CellData[][],
  cells: Array<[number, number]>,
  type: InfrastructureType
): CellData[][] => {
  for (const [r, c] of cells) grid[r][c] = { ...grid[r][c], infrastructure: type };
  return grid;
};

describe('isInfrastructureType — the JSON-boundary guard', () => {
  it.each(INFRASTRUCTURE_TYPES)('accepts %s', (type) => {
    expect(isInfrastructureType(type)).toBe(true);
  });

  it.each(['lava', 'WALL', '', 42, null, undefined, {}])(
    'drops %s',
    (value) => {
      expect(isInfrastructureType(value)).toBe(false);
    }
  );
});

describe('INFRA_META — the SMA-15 blocker mapping', () => {
  it('wall/fence/trellis block with their dictated heights', () => {
    expect(INFRA_META.wall).toMatchObject({ blocksLight: true, heightCategory: 'tall' });
    expect(INFRA_META.fence).toMatchObject({ blocksLight: true, heightCategory: 'mid' });
    expect(INFRA_META.trellis).toMatchObject({ blocksLight: true, heightCategory: 'tall' });
  });

  it('path/water/pot carry the §6 "Pas d\'ombre" badge (no shadow)', () => {
    expect(INFRA_META.path.blocksLight).toBe(false);
    expect(INFRA_META.water.blocksLight).toBe(false);
    expect(INFRA_META.pot.blocksLight).toBe(false);
  });
});

describe('groupInfrastructureRegions — rectangles from per-cell paint', () => {
  it('a 1×6 horizontal wall run is ONE region', () => {
    const grid = paint(emptyGrid(3, 8), [[1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6]], 'wall');
    expect(groupInfrastructureRegions(grid)).toEqual([
      { type: 'wall', startRow: 1, startCol: 1, spanRows: 1, spanCols: 6 },
    ]);
  });

  it('a 6×1 vertical run merges into ONE region', () => {
    const grid = paint(emptyGrid(6, 3), [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2]], 'trellis');
    expect(groupInfrastructureRegions(grid)).toEqual([
      { type: 'trellis', startRow: 0, startCol: 2, spanRows: 6, spanCols: 1 },
    ]);
  });

  it('two separated walls are TWO regions', () => {
    const grid = paint(emptyGrid(3, 8), [[0, 0], [0, 1]], 'wall');
    paint(grid, [[2, 4], [2, 5]], 'wall');
    expect(groupInfrastructureRegions(grid)).toHaveLength(2);
  });

  it('adjacent DIFFERENT types never merge', () => {
    const grid = paint(emptyGrid(1, 4), [[0, 0], [0, 1]], 'wall');
    paint(grid, [[0, 2], [0, 3]], 'path');
    expect(groupInfrastructureRegions(grid)).toEqual([
      { type: 'wall', startRow: 0, startCol: 0, spanRows: 1, spanCols: 2 },
      { type: 'path', startRow: 0, startCol: 2, spanRows: 1, spanCols: 2 },
    ]);
  });

  it('an L-shape decomposes into 2 rectangles (documented v1)', () => {
    // ██
    // █
    const grid = paint(emptyGrid(2, 3), [[0, 0], [0, 1], [1, 0]], 'wall');
    const regions = groupInfrastructureRegions(grid);
    expect(regions).toEqual([
      { type: 'wall', startRow: 0, startCol: 0, spanRows: 1, spanCols: 2 },
      { type: 'wall', startRow: 1, startCol: 0, spanRows: 1, spanCols: 1 },
    ]);
  });

  it('an inactive cell breaks a run and never joins a region', () => {
    const grid = paint(emptyGrid(1, 3), [[0, 0], [0, 1], [0, 2]], 'wall');
    grid[0][1] = { ...grid[0][1], active: false };
    expect(groupInfrastructureRegions(grid)).toEqual([
      { type: 'wall', startRow: 0, startCol: 0, spanRows: 1, spanCols: 1 },
      { type: 'wall', startRow: 0, startCol: 2, spanRows: 1, spanCols: 1 },
    ]);
  });

  it('unknown stored values are ignored (same guard as the JSON boundary)', () => {
    const grid = emptyGrid(1, 2);
    (grid[0][0] as { infrastructure?: string }).infrastructure = 'lava';
    expect(groupInfrastructureRegions(grid)).toEqual([]);
  });
});

describe('infrastructureBlockers — the exposure-engine input', () => {
  it('maps a wall region to a tall blocking footprint', () => {
    const grid = paint(emptyGrid(8, 10), [[6, 2], [6, 3], [6, 4]], 'wall');
    expect(infrastructureBlockers(grid)).toEqual([
      {
        row: 6,
        col: 2,
        spanRows: 1,
        spanCols: 3,
        heightCategory: 'tall',
        blocksLight: true,
      },
    ]);
  });

  it('fence maps to mid height', () => {
    const grid = paint(emptyGrid(3, 3), [[1, 1]], 'fence');
    expect(infrastructureBlockers(grid)[0].heightCategory).toBe('mid');
  });

  it('path, water and pot produce NO blockers', () => {
    const grid = paint(emptyGrid(3, 6), [[0, 0]], 'path');
    paint(grid, [[1, 1]], 'water');
    paint(grid, [[2, 2]], 'pot');
    expect(infrastructureBlockers(grid)).toEqual([]);
  });
});

describe('derived blockers × the exposure engine (the SMA-15 payoff)', () => {
  // Oriented S, N hemisphere, band mid — the mockup É1 frame: the noon sun
  // sits at the grid's bottom, a bottom-row wall casts its shadow UP.
  const params = (grid: CellData[][], over: object = {}) => ({
    rows: grid.length,
    cols: grid[0].length,
    activeCells: grid.map((row) => row.map((cell) => cell.active)),
    orientation: 'S',
    hemisphere: 'N',
    latitudeBand: 'mid',
    gardenType: null,
    lightSchedule: null,
    blockers: infrastructureBlockers(grid),
    overrides: {},
    season: 'summer' as const,
    ...over,
  });

  it('a painted wall yields SHADE above it in the aggregate', () => {
    const grid = paint(emptyGrid(8, 10), [[7, 3], [7, 4], [7, 5]], 'wall');
    const result = computeExposureGrid(params(grid));
    if (result.mode !== 'aggregate') throw new Error('expected aggregate');
    // tall/summer/mid = 2 cells of noon shadow going up.
    expect(result.cells[6][4]).toBe('shade');
    expect(result.cells[5][4]).toBe('shade');
    expect(result.cells[4][4]).not.toBe('shade');
  });

  it('the shadow MOVES with the moment (morning: sun E → shadow left)', () => {
    const grid = paint(emptyGrid(4, 6), [[1, 3]], 'wall');
    const noon = computeExposureGrid(params(grid, { moment: 'noon' }));
    const morning = computeExposureGrid(params(grid, { moment: 'morning' }));
    if (noon.mode !== 'moment' || morning.mode !== 'moment')
      throw new Error('expected moment');
    // Noon (sun at the bottom): shadow goes UP from the wall.
    expect(noon.cells[0][3]).toBe('shadowed');
    expect(noon.cells[1][2]).toBe('lit');
    // Morning (sun E = screen right when oriented S): shadow goes LEFT.
    expect(morning.cells[1][2]).toBe('shadowed');
    expect(morning.cells[0][3]).toBe('lit');
  });

  it('the shadow LENGTHENS with winter', () => {
    const grid = paint(emptyGrid(6, 4), [[5, 1]], 'wall');
    const summer = computeExposureGrid(params(grid, { moment: 'noon' }));
    const winter = computeExposureGrid(
      params(grid, { moment: 'noon', season: 'winter' })
    );
    if (summer.mode !== 'moment' || winter.mode !== 'moment')
      throw new Error('expected moment');
    // tall: 2 cells summer, 3 winter.
    expect(summer.cells[3][1]).toBe('shadowed');
    expect(summer.cells[2][1]).toBe('lit');
    expect(winter.cells[2][1]).toBe('shadowed');
  });

  it('a painted path/water/pot garden stays fully lit', () => {
    const grid = paint(emptyGrid(3, 6), [[2, 0], [2, 1], [2, 2]], 'path');
    paint(grid, [[0, 4]], 'water');
    paint(grid, [[1, 5]], 'pot');
    const result = computeExposureGrid(params(grid, { moment: 'noon' }));
    if (result.mode !== 'moment') throw new Error('expected moment');
    for (const row of result.cells) {
      for (const state of row) expect(state).toBe('lit');
    }
  });
});
