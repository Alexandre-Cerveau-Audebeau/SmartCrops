import { describe, expect, it } from 'vitest';
import type { CellData } from '../../types/GardenLayout';
import {
  cellRef,
  cellSizeToMeters,
  clampFootprintToGrid,
  colToLetter,
  footprintFits,
  rectsOverlap,
  spacingToFootprintCells,
  type FootprintRect,
} from './placementGeometry';
import type { PlannerPlacement } from './plannerReducer';

// SMA-193 (5.5 lot 1) — the placement geometry contract. The spacing→cells
// pins anchor on the mockup (Courgette: 90 cm at 50 cm/cell → 2×2).

const rect = (
  startRow: number,
  startCol: number,
  spanRows = 1,
  spanCols = 1
): FootprintRect => ({ startRow, startCol, spanRows, spanCols });

const placement = (
  id: string,
  startRow: number,
  startCol: number,
  span = 1
): PlannerPlacement => ({
  id,
  plantId: 'p1',
  startRow,
  startCol,
  spanRows: span,
  spanCols: span,
  notes: null,
});

const grid = (rows: number, cols: number): CellData[][] =>
  Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ active: true }) as CellData)
  );

describe('rectsOverlap', () => {
  it('detects a shared cell', () => {
    expect(rectsOverlap(rect(0, 0, 2, 2), rect(1, 1, 2, 2))).toBe(true);
  });

  it('containment overlaps', () => {
    expect(rectsOverlap(rect(0, 0, 3, 3), rect(1, 1))).toBe(true);
  });

  it('touching edges do NOT overlap (adjacent columns)', () => {
    expect(rectsOverlap(rect(0, 0, 2, 2), rect(0, 2, 2, 2))).toBe(false);
  });

  it('touching edges do NOT overlap (adjacent rows)', () => {
    expect(rectsOverlap(rect(0, 0, 2, 2), rect(2, 0, 2, 2))).toBe(false);
  });

  it('disjoint rectangles do not overlap', () => {
    expect(rectsOverlap(rect(0, 0), rect(5, 5))).toBe(false);
  });
});

describe('footprintFits', () => {
  it('accepts a footprint fully inside an empty active grid', () => {
    expect(footprintFits(grid(4, 4), [], rect(1, 1, 2, 2))).toEqual({
      ok: true,
    });
  });

  it("rejects 'out-of-bounds' when the span crosses the edge", () => {
    expect(footprintFits(grid(4, 4), [], rect(3, 3, 2, 2))).toEqual({
      ok: false,
      reason: 'out-of-bounds',
    });
  });

  it("rejects 'inactive' when ANY footprint cell is inactive", () => {
    const g = grid(4, 4);
    g[2][2] = { active: false };
    expect(footprintFits(g, [], rect(1, 1, 2, 2))).toEqual({
      ok: false,
      reason: 'inactive',
    });
  });

  it("rejects 'overlap' with the offending placement id", () => {
    const p = placement('occupied', 1, 1, 2);
    expect(footprintFits(grid(6, 6), [p], rect(2, 2, 2, 2))).toEqual({
      ok: false,
      reason: 'overlap',
      overlapWith: 'occupied',
    });
  });

  it('ignorePlacementId excludes the moved placement from the overlap scan', () => {
    const p = placement('self', 1, 1, 2);
    expect(footprintFits(grid(6, 6), [p], rect(1, 1, 2, 2), 'self')).toEqual({
      ok: true,
    });
  });

  it('a placement on adjacent cells (touching edge) still fits', () => {
    const p = placement('neighbor', 0, 0, 2);
    expect(footprintFits(grid(6, 6), [p], rect(0, 2, 2, 2))).toEqual({
      ok: true,
    });
  });

  it('enforces the positive-span invariant itself (R4): zero/negative spans are out-of-bounds', () => {
    // A 0-span rectangle would pass the bounds arithmetic, skip the cell
    // loop, and never overlap — the guard rejects it before any of that.
    expect(footprintFits(grid(4, 4), [], rect(1, 1, 0, 1))).toEqual({
      ok: false,
      reason: 'out-of-bounds',
    });
    expect(footprintFits(grid(4, 4), [], rect(1, 1, 1, 0))).toEqual({
      ok: false,
      reason: 'out-of-bounds',
    });
    expect(footprintFits(grid(4, 4), [], rect(1, 1, -1, -1))).toEqual({
      ok: false,
      reason: 'out-of-bounds',
    });
    // Regression pin: the minimal valid candidate is untouched by the guard.
    expect(footprintFits(grid(4, 4), [], rect(1, 1, 1, 1))).toEqual({
      ok: true,
    });
  });
});

describe('spacingToFootprintCells — the mockup anchors', () => {
  it('90 cm at 50 cm/cell → 2 (Courgette 2×2)', () => {
    expect(spacingToFootprintCells(90, 'cm', '50cm')).toEqual({
      cells: 2,
      known: true,
    });
  });

  it('18 inches (45.72 cm) at 50 cm/cell → 1', () => {
    expect(spacingToFootprintCells(18, 'inches', '50cm')).toEqual({
      cells: 1,
      known: true,
    });
  });

  it('100 cm at 50 cm/cell → 2 (exact multiple)', () => {
    expect(spacingToFootprintCells(100, 'cm', '50cm')).toEqual({
      cells: 2,
      known: true,
    });
  });

  it('50 cm at 50 cm/cell → 1', () => {
    expect(spacingToFootprintCells(50, 'cm', '50cm')).toEqual({
      cells: 1,
      known: true,
    });
  });

  it('unknown spacing → 1×1, known:false', () => {
    expect(spacingToFootprintCells(null, null, '50cm')).toEqual({
      cells: 1,
      known: false,
    });
    expect(spacingToFootprintCells(90, null, '50cm')).toEqual({
      cells: 1,
      known: false,
    });
    expect(spacingToFootprintCells(null, 'cm', '50cm')).toEqual({
      cells: 1,
      known: false,
    });
  });

  it('unparseable source unit → 1×1, known:false (never a guessed conversion)', () => {
    expect(spacingToFootprintCells(3, 'feet', '50cm')).toEqual({
      cells: 1,
      known: false,
    });
  });

  it('scales with the cell size (90 cm at 25 cm/cell → 4; at 1 m/cell → 1)', () => {
    expect(spacingToFootprintCells(90, 'cm', '25cm').cells).toBe(4);
    expect(spacingToFootprintCells(90, 'cm', '1m').cells).toBe(1);
  });

  it('exactly-divisible ratios never round up to an extra cell (R3 epsilon)', () => {
    // Every exact multiple across the three legal cell sizes stays exact —
    // the epsilon absorbs any conversion dust without shifting real ratios.
    expect(spacingToFootprintCells(50, 'cm', '25cm').cells).toBe(2);
    expect(spacingToFootprintCells(100, 'cm', '25cm').cells).toBe(4);
    expect(spacingToFootprintCells(200, 'cm', '1m').cells).toBe(2);
    // 100 inches = 254 cm exactly → 254/25 = 10.16 → 11; 254/50 = 5.08 → 6.
    expect(spacingToFootprintCells(100, 'inches', '25cm').cells).toBe(11);
    expect(spacingToFootprintCells(100, 'inches', '50cm').cells).toBe(6);
  });

  it('a ratio genuinely above an integer still ceils UP — the epsilon cannot swallow real overages (R4)', () => {
    // Boundary companion of the exact-multiple pins above: 100 cm at
    // 50 cm/cell is exactly 2, so 100.1 cm must take 3 cells. (The dictated
    // 45 cm/cell variant is not expressible — '45cm' is not a wire value.)
    expect(spacingToFootprintCells(100.1, 'cm', '50cm').cells).toBe(3);
    expect(spacingToFootprintCells(25.1, 'cm', '25cm').cells).toBe(2);
  });

  it('inches-derived non-terminating ratios stay stable under the epsilon (R3)', () => {
    // 18 in = 45.72 cm → /50 = 0.9144 → 1 (the lot-1 pin, unchanged).
    expect(spacingToFootprintCells(18, 'inches', '50cm').cells).toBe(1);
    // 33 in = 83.82 cm → /25 = 3.3528 → 4 — a mid-ratio value the epsilon
    // must not drag down to 3.
    expect(spacingToFootprintCells(33, 'inches', '25cm').cells).toBe(4);
  });
});

describe('cellSizeToMeters (moved from GardenPlanner.tsx — same mapping)', () => {
  it.each([
    ['1m', 1],
    ['50cm', 0.5],
    ['25cm', 0.25],
  ] as const)('%s → %s', (size, meters) => {
    expect(cellSizeToMeters(size)).toBe(meters);
  });
});

// Lot 3 — the pose-time clamp: an oversized suggestion never blocks the pose.
describe('clampFootprintToGrid (SMA-193 lot 3)', () => {
  it('an 8×8 suggestion on a 10×8 grid keeps 8×8', () => {
    expect(clampFootprintToGrid(8, grid(10, 8))).toEqual({
      spanRows: 8,
      spanCols: 8,
    });
  });

  it('an 8×8 suggestion on a 6×6 grid clamps to 6×6', () => {
    expect(clampFootprintToGrid(8, grid(6, 6))).toEqual({
      spanRows: 6,
      spanCols: 6,
    });
  });

  it('clamps each axis independently on a rectangular grid', () => {
    expect(clampFootprintToGrid(8, grid(4, 12))).toEqual({
      spanRows: 4,
      spanCols: 8,
    });
  });

  it('a fitting 2×2 suggestion is untouched', () => {
    expect(clampFootprintToGrid(2, grid(6, 6))).toEqual({
      spanRows: 2,
      spanCols: 2,
    });
  });
});

describe('cell references (collision toast copy)', () => {
  it.each([
    [0, 'A'],
    [7, 'H'],
    [25, 'Z'],
    [26, 'AA'],
  ] as const)('colToLetter(%s) → %s', (col, letter) => {
    expect(colToLetter(col)).toBe(letter);
  });

  it('cellRef is column letter + 1-based row (mockup "H3")', () => {
    expect(cellRef(2, 7)).toBe('H3');
    expect(cellRef(0, 0)).toBe('A1');
  });
});
