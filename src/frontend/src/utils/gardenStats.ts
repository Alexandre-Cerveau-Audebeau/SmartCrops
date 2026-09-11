import type { PlacementData } from '../services/gardenLayoutApi';
import type { DashboardGardenData } from '../types/DashboardData';
import { parseCellsJson, type CellData } from '../types/GardenLayout';
import { computeExposureView } from '../pages/gardenPlanner/exposureView';
import { cellSizeToMeters } from '../pages/gardenPlanner/placementGeometry';
import type { ExposureCategory } from './exposure';
import { infrastructureBlockers } from './infrastructure';

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

/**
 * How many active cells fall in each exposure category.
 *
 * READ-ONLY in the type system, not only in the comment (round 6, Extension
 * #5-19): `gardenViewOf` hands one cached `GardenView` per garden to both the
 * Gardens and the Statistics widgets, so a tally is a shared object. A consumer
 * that accumulated into `view.exposure` instead of into a fresh tally would
 * corrupt every other reader of that garden for the rest of the load, and the
 * defect would appear in the widget that did not do the write. The builders
 * below work on the mutable local shape and widen on return.
 */
export type ExposureTally = Readonly<Record<ExposureCategory, number>>;

/** The shape a builder accumulates into, before it hands the tally out. */
type MutableExposureTally = Record<ExposureCategory, number>;

const EMPTY_TALLY: ExposureTally = {
  full: 0,
  morning: 0,
  afternoon: 0,
  shade: 0,
};

/** A fresh zeroed tally — never the shared constant, which callers would mutate. */
export function emptyExposureTally(): MutableExposureTally {
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
 * The four categories, sunniest first.
 *
 * Declared here rather than derived from the engine's union type, because the
 * ORDER is the point and a type has none. It breaks ties in
 * {@link dominantExposure} — the same garden must not report « full » on one
 * load and « morning » on the next — and it is the reading order of the
 * Statistics distribution.
 */
export const EXPOSURE_ORDER: readonly ExposureCategory[] = [
  'full',
  'morning',
  'afternoon',
  'shade',
];

/**
 * Cells a tally actually rates — the denominator of every exposure share
 * (round 6, Extension #4-10).
 *
 * The same reduction was written three times in the Statistics widget, in two
 * styles: once for the page distribution, once for a garden's spoken label, once
 * for its printed share. The last two divide what a screen reader hears and what
 * the eye reads by figures that could drift apart without anything noticing.
 */
export const ratedCells = (tally: ExposureTally): number =>
  EXPOSURE_ORDER.reduce((sum, key) => sum + tally[key], 0);

export function dominantExposure(
  tally: ExposureTally
): ExposureCategory | null {
  let best: ExposureCategory | null = null;
  for (const category of EXPOSURE_ORDER) {
    if (tally[category] > 0 && (best === null || tally[category] > tally[best])) {
      best = category;
    }
  }
  return best;
}

/** What the placements of a garden actually cover, once. */
export interface PlacementCoverage {
  /** `rows × cols`: true where at least one placement footprint lands. */
  taken: boolean[][];
  /**
   * Active cells covered — clipped to the grid, overlaps counted ONCE, cells
   * the user switched off excluded.
   */
  occupiedCells: number;
}

/**
 * The ONE coverage every occupancy figure of a garden derives from (round 3,
 * E″9 / G″6).
 *
 * The figures used to come from two different notions of « occupied ».
 * `garden.occupiedCells` arrives from the server as `Σ spanRows × spanCols`,
 * which counts a cell twice when two placements overlap it, counts cells that
 * fall outside the plan, and counts cells the user switched off; the free-cell
 * exposure tally instead clipped, deduplicated, and looked only at rated cells.
 * So the same garden could report 100 % occupancy and a free cell in the same
 * breath — two overlapping placements on one of two active cells did exactly
 * that. Everything is measured here now, so the figures cannot disagree: they
 * are the same count.
 *
 * A cell is « active » iff the exposure engine rated it — it returns `null` per
 * inactive cell, which is the same set `gridStats` counts. That equality is what
 * makes `occupied + free = active` an identity rather than a coincidence.
 */
export function placementCoverage(
  cells: (ExposureCategory | null)[][] | null,
  placements: readonly PlacementData[],
  rows: number,
  cols: number
): PlacementCoverage {
  const taken = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
  let occupiedCells = 0;
  if (!cells) return { taken, occupiedCells };

  for (const placement of placements) {
    // Clipped at both ends: a stored layout may anchor a placement outside the
    // plan, and the layout PUT does not refuse it.
    const rowEnd = Math.min(rows, placement.startRow + placement.spanRows);
    const colEnd = Math.min(cols, placement.startCol + placement.spanCols);
    for (let r = Math.max(0, placement.startRow); r < rowEnd; r++) {
      for (let c = Math.max(0, placement.startCol); c < colEnd; c++) {
        if (taken[r]![c]) continue; // an overlapped cell is one cell
        taken[r]![c] = true;
        // Only a rated cell is surface. A plant sitting on a switched-off cell
        // occupies nothing the garden could have used.
        if (cells[r]?.[c]) occupiedCells += 1;
      }
    }
  }

  return { taken, occupiedCells };
}

/**
 * Exposure tally restricted to cells that are active AND hold no plant — the
 * « 68 free cells, 28 of them in full sun » of the Statistics widget.
 */
export function freeCellExposureTally(
  cells: (ExposureCategory | null)[][] | null,
  placements: readonly PlacementData[],
  rows: number,
  cols: number
): ExposureTally {
  if (!cells) return emptyExposureTally();
  return freeExposureFrom(
    cells,
    placementCoverage(cells, placements, rows, cols).taken,
    rows,
    cols
  );
}

/** The free-cell tally, read off a coverage already computed. */
function freeExposureFrom(
  cells: (ExposureCategory | null)[][],
  taken: boolean[][],
  rows: number,
  cols: number
): ExposureTally {
  const tally = emptyExposureTally();
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

/**
 * Everything one garden's plan says, derived in one pass.
 *
 * Composed here rather than inside a component so the widgets stay
 * presentational and the arithmetic stays testable without a DOM. The Gardens
 * table, the Gardens cards and the Statistics sections all read this same shape,
 * which is also what keeps the occupancy of a garden identical in all three.
 */
export interface GardenView {
  readonly activeCells: number;
  readonly totalCells: number;
  readonly surfaceM2: number;
  readonly occupiedCells: number;
  readonly freeCells: number;
  readonly occupancyPercent: number;
  readonly dominantExposure: ExposureCategory | null;
  readonly exposure: ExposureTally;
  readonly freeExposure: ExposureTally;
  /** False when the garden has no saved layout — nothing here can be trusted then. */
  readonly hasPlan: boolean;
}

/**
 * The season and moment the dashboard rates exposure at, fixed rather than
 * derived (decision D12).
 *
 * The planner lets the user pick both; the dashboard has no such control, and
 * the frozen design writes the choice into the section header — « DOMINANT
 * EXPOSURE — SUMMER · NOON ». Deriving them from a clock instead would make the
 * figure change under a user who changed nothing, and would make every test of
 * this module depend on the day it runs. The engine is declared clock-free and
 * this keeps it that way.
 */
export const DASHBOARD_SEASON = 'summer' as const;
export const DASHBOARD_MOMENT = 'noon' as const;

export function deriveGardenView(garden: DashboardGardenData): GardenView {
  const width = garden.width ?? 0;
  const height = garden.height ?? 0;
  const hasPlan = width > 0 && height > 0;

  if (!hasPlan) {
    return {
      activeCells: 0,
      totalCells: 0,
      surfaceM2: 0,
      // Zero, not the server's footprint sum (round 3, E″9). A garden with no
      // plan has no surface to occupy, and every reader of this branch is
      // already gated on `hasPlan`. Carrying the transport count here was the
      // one place where `occupied + free = active` did not hold.
      occupiedCells: 0,
      freeCells: 0,
      occupancyPercent: 0,
      dominantExposure: null,
      exposure: emptyExposureTally(),
      freeExposure: emptyExposureTally(),
      hasPlan: false,
    };
  }

  const grid = parseCellsJson(garden.cellsJson, width, height);
  const { activeCells, totalCells, surfaceM2 } = gridStats(grid, garden.cellSize);
  const blockers = infrastructureBlockers(grid);

  const view = computeExposureView({
    grid,
    rows: height,
    cols: width,
    // The engine reads five config fields and applies its own defaults for the
    // ones a garden never set; the rest of `Garden` is display data it ignores.
    garden: {
      id: garden.id,
      name: garden.name,
      orientation: garden.config.orientation,
      gardenType: garden.config.gardenType,
      lightSchedule: garden.config.lightSchedule,
      hemisphere: garden.config.hemisphere,
      latitudeBand: garden.config.latitudeBand,
    },
    blockers,
    season: DASHBOARD_SEASON,
    moment: DASHBOARD_MOMENT,
    // The dashboard never draws the cast-shadow hatch, so the second engine
    // pass would be computed and thrown away — once per garden, on every load.
    castsShadow: false,
  });

  const exposure = exposureTally(view.cells);

  // ONE coverage, four figures (round 3, E″9 / G″6). `garden.occupiedCells`
  // — the server's Σ spanRows × spanCols — is deliberately NOT read here: it
  // is the transport's own count of footprints, not a count of cells, and
  // mixing it with a clipped, deduplicated tally is what let the widget say
  // « 100 % occupied » beside « 1 free cell ».
  const coverage = placementCoverage(view.cells, garden.placements, height, width);

  return {
    activeCells,
    totalCells,
    surfaceM2,
    occupiedCells: coverage.occupiedCells,
    freeCells: freeCells(activeCells, coverage.occupiedCells),
    occupancyPercent: occupancyPercent(activeCells, coverage.occupiedCells),
    dominantExposure: dominantExposure(exposure),
    exposure,
    freeExposure: view.cells
      ? freeExposureFrom(view.cells, coverage.taken, height, width)
      : emptyExposureTally(),
    hasPlan: true,
  };
}

/**
 * One derivation per garden OBJECT, however many callers ask for it
 * (round 1, E10 / G4 / E22).
 *
 * `deriveGardenView` walks the whole grid several times — `gridStats`,
 * `infrastructureBlockers`, `computeExposureView`, `exposureTally` and
 * `freeCellExposureTally` are each O(width × height) and each allocate — and two
 * widgets want the same answer for the same gardens. Before this, `GardensBlock`
 * ran it inline for every row on every render (it owns the rename dialog, so a
 * keystroke re-ran the engine once per garden per character) while `StatsBlock`
 * kept its own memoized copy of the identical result.
 *
 * The key is the garden object itself, so the cache invalidates on exactly the
 * thing that matters: `useDashboardData` builds fresh objects on every fetch, so
 * new data is never served from here, and a re-render that changed no data is
 * always a hit. A `WeakMap` holds nothing alive — an entry disappears with the
 * garden it describes.
 *
 * A cached `GardenView` is SHARED, so it must be treated as read-only. Nothing
 * on the dashboard writes to one — `sumExposureTallies` accumulates into a fresh
 * tally rather than into its inputs — and this is the reason it must stay that
 * way.
 */
const viewCache = new WeakMap<DashboardGardenData, GardenView>();

/** {@link deriveGardenView}, memoized on the garden object. */
export function gardenViewOf(garden: DashboardGardenData): GardenView {
  const cached = viewCache.get(garden);
  if (cached) return cached;

  const view = deriveGardenView(garden);
  viewCache.set(garden, view);
  return view;
}

/** Sums a list of tallies — the Statistics widget's all-gardens distribution. */
export function sumExposureTallies(
  tallies: readonly ExposureTally[]
): ExposureTally {
  const total = emptyExposureTally();
  for (const tally of tallies) {
    total.full += tally.full;
    total.morning += tally.morning;
    total.afternoon += tally.afternoon;
    total.shade += tally.shade;
  }
  return total;
}
