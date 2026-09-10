import type { PlacementData } from '../services/gardenLayoutApi';
import type { CellData } from '../types/GardenLayout';
import { cellSizeToMeters } from '../pages/gardenPlanner/placementGeometry';
import type { ExposureCategory } from './exposure';

/**
 * SMA-336 PR 2/5 — what a garden's plan says about it, in numbers.
 *
 * The server transports the plan and stops there (decision D9), so every figure
 * the Gardens and Statistics widgets show is derived here: active cells,
 * surface, occupancy, free cells, and the exposure tally. All PURE — no React,
 * no clock, no DOM.
 *
 * The edible rule lives here too, for one reason: the ornamental split of the
 * Counters widget is a per-VARIETY question, and the server's per-GARDEN verdict
 * cannot answer it. Both apply the same two-column predicate, and the tests on
 * each side pin the same measured catalog cases.
 */

/** Cells of the grid, by what they can hold. */
export interface GridStats {
  /** Cells the user has not switched off — the plantable surface. */
  activeCells: number;
  /** Every cell of the rectangle, active or not. */
  totalCells: number;
  /** Active surface in square metres, unrounded. */
  surfaceM2: number;
}

/**
 * Active cells, total cells and active surface.
 *
 * NOTE — this repeats the three lines the planner computes inline
 * (`GardenPlanner.tsx`, the toolbar meta line). Reusing them would mean editing
 * the planner, which this lot does not own: the planner formats its surface
 * straight into an i18n string, so sharing the function is not an import but a
 * rewrite of the lines around it, inside a 2 900-line page with its own test
 * file. Three lines of arithmetic duplicated knowingly is the cheaper risk; the
 * shared home is `cellSizeToMeters`, which both sides already call.
 */
export function gridStats(
  grid: CellData[][] | null,
  cellSize: string | null
): GridStats {
  const flat = grid ? grid.flat() : [];
  const activeCells = flat.filter((cell) => cell.active).length;
  const metres = cellSizeToMeters(cellSize ?? '');
  return {
    activeCells,
    totalCells: flat.length,
    surfaceM2: activeCells * metres * metres,
  };
}

/**
 * Cells that are active and hold no plant.
 *
 * Clamped at zero: nothing forbids a stored layout from placing more plant cells
 * than there are active ones — the layout PUT validates neither overlap nor
 * whether a placement sits on a cell the user switched off — and a negative
 * count of free cells would read as a data bug in the UI rather than in the data.
 */
export function freeCells(activeCells: number, occupiedCells: number): number {
  return Math.max(0, activeCells - occupiedCells);
}

/**
 * Occupancy as a whole percentage.
 *
 * Of the PLANTABLE cells, not of the rectangle: the frozen design states that
 * « N free » counts free cells of the plan while the percentage is a share of
 * the plantable ones, and that the two do not recompute from one another. A
 * garden with no active cell has no occupancy to speak of — 0, not a division
 * by zero.
 */
export function occupancyPercent(
  activeCells: number,
  occupiedCells: number
): number {
  if (activeCells <= 0) return 0;
  return Math.round((Math.min(occupiedCells, activeCells) / activeCells) * 100);
}

/** How many active cells fall in each exposure category. */
export type ExposureTally = Record<ExposureCategory, number>;

const EMPTY_TALLY: ExposureTally = {
  full: 0,
  morning: 0,
  afternoon: 0,
  shade: 0,
};

/** A fresh zeroed tally — never the shared constant, which callers would mutate. */
export function emptyExposureTally(): ExposureTally {
  return { ...EMPTY_TALLY };
}

/**
 * Counts the exposure categories over the cells the engine actually rated.
 *
 * `computeExposureView` returns `null` per inactive cell, so nothing here needs
 * to re-check `active`: an unrated cell is a cell that does not count.
 */
export function exposureTally(
  cells: (ExposureCategory | null)[][] | null
): ExposureTally {
  const tally = emptyExposureTally();
  if (!cells) return tally;
  for (const row of cells) {
    for (const category of row) {
      if (category) tally[category] += 1;
    }
  }
  return tally;
}

/**
 * The category the most cells fall into, or null when nothing is rated.
 *
 * Ties are broken by the declared order below rather than by whichever key the
 * runtime happens to enumerate first: the same garden must not report « full »
 * on one load and « morning » on the next. Sunnier wins, which is the reading a
 * gardener expects from a single-word summary.
 */
const DOMINANCE_ORDER: readonly ExposureCategory[] = [
  'full',
  'morning',
  'afternoon',
  'shade',
];

export function dominantExposure(
  tally: ExposureTally
): ExposureCategory | null {
  let best: ExposureCategory | null = null;
  for (const category of DOMINANCE_ORDER) {
    if (tally[category] > 0 && (best === null || tally[category] > tally[best])) {
      best = category;
    }
  }
  return best;
}

/**
 * Exposure tally restricted to cells that are active AND hold no plant — the
 * « 68 free cells, 28 of them in full sun » of the Statistics widget.
 *
 * Placement footprints are walked rather than intersected: a placement is a
 * rectangle anchored top-left, exactly as the planner's geometry defines it, and
 * marking its cells is cheaper and clearer than any overlap arithmetic.
 */
export function freeCellExposureTally(
  cells: (ExposureCategory | null)[][] | null,
  placements: readonly PlacementData[],
  rows: number,
  cols: number
): ExposureTally {
  const tally = emptyExposureTally();
  if (!cells) return tally;

  const taken = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
  for (const placement of placements) {
    for (let r = placement.startRow; r < placement.startRow + placement.spanRows; r++) {
      for (let c = placement.startCol; c < placement.startCol + placement.spanCols; c++) {
        if (r >= 0 && r < rows && c >= 0 && c < cols) taken[r]![c] = true;
      }
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const category = cells[r]?.[c];
      if (category && !taken[r]![c]) tally[category] += 1;
    }
  }
  return tally;
}

/**
 * Plant types whose members are edible whatever their own flag says.
 *
 * Mirrors `EdiblePlantTypes` in `DashboardController`. The two signals disagree
 * on the real catalog — 31 plants of these three types carry
 * `isEdible: false`, and 38 `Ornamental` plants carry `isEdible: true` — so a
 * rule built on either alone misfiles one group or the other.
 */
const EDIBLE_PLANT_TYPES: readonly string[] = ['Vegetable', 'Fruit', 'Herb'];

/** The two fields the rule reads; anything carrying them can be judged. */
export interface EdibleSignals {
  plantType: string | null;
  isEdible: boolean | null;
}

/**
 * Rule R4 — a variety is edible when its TYPE says so OR its flag does.
 *
 * `isEdible: null` never means edible on its own: the flag is missing on 12
 * catalog rows while the type is filled on all 536, so the type decides alone
 * when the flag is silent.
 */
export function isEdibleVariety(variety: EdibleSignals): boolean {
  if (variety.isEdible === true) return true;
  return variety.plantType !== null && EDIBLE_PLANT_TYPES.includes(variety.plantType);
}

/**
 * Whether a garden is ornamental, from the varieties planted in it.
 *
 * Three states, and the third one matters: `null` for a garden with NO variety.
 * An unplanted garden is neither ornamental nor edible, and calling it
 * ornamental would apply « an ornamental garden never shows a harvest » to a
 * garden nobody has planted yet.
 *
 * A single edible variety is enough to make the garden edible. The two mistakes
 * do not cost the same: calling an edible garden ornamental HIDES a real
 * harvest, while the reverse shows an empty one.
 */
export function isOrnamentalGarden(
  varieties: readonly EdibleSignals[]
): boolean | null {
  if (varieties.length === 0) return null;
  return !varieties.some(isEdibleVariety);
}
