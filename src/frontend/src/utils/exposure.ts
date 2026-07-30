import type { LightSlot } from '../types/Garden';
import { slotHours } from './lightSchedule';

/**
 * Exposure engine (SMA-17, phase 5.3-C) — PURE functions only, no React, no
 * I/O, no clock. Computes the per-cell exposure category from the garden
 * config (orientation, hemisphere, latitudeBand, gardenType, lightSchedule)
 * and a list of light-blocking obstacles. 5.3-D wires this to the visual
 * layer; 5.4 starts producing real blockers (infrastructures) — until then
 * the engine ACCEPTS them as input and only tests exercise them.
 *
 * Engraved model (SMA-17, 14-15/07): discrete estimation over 3 moments ×
 * 2 seasons; sun directions absolute per hemisphere; shadow lengths from a
 * discrete (height × season × latitudeBand) table; per-cell aggregation into
 * 4 categories; manual per-cell override wins; indoor lightSchedule is a
 * uniform override. Constants the model left open are implemented below and
 * pinned by tests — ratified (SMA-17 harvest #176; v32 §0.3.25).
 */

export type ExposureCategory = 'full' | 'morning' | 'afternoon' | 'shade';
export type Moment = 'morning' | 'noon' | 'evening';
export type Season = 'summer' | 'winter';
export type Hemisphere = 'N' | 'S';
export type LatitudeBand = 'low' | 'mid' | 'high';
export type Orientation = 'N' | 'E' | 'S' | 'W';
export type HeightCategory = 'low' | 'mid' | 'tall';
/** Per-moment cell state (moment mode). */
export type CellMomentState = 'lit' | 'shadowed';

/**
 * A light-blocking obstacle occupying a rectangular footprint on the grid.
 * Infrastructures (5.4) will map onto this shape; `blocksLight: false`
 * mirrors the §6 "Pas d'ombre" badge (path, water point) and casts nothing.
 */
export interface Blocker {
  row: number;
  col: number;
  spanRows: number;
  spanCols: number;
  heightCategory: HeightCategory;
  blocksLight: boolean;
}

export interface ExposureParams {
  // Grid geometry — the per-cell output is addressable by [row][col].
  rows: number;
  cols: number;
  /** Active flags per cell; anything not strictly `true` is inactive. */
  activeCells: boolean[][];
  // Garden config (nullable, as served by GET — defaults applied at READ).
  orientation: string | null;
  hemisphere: string | null;
  latitudeBand: string | null;
  gardenType: string | null;
  lightSchedule: LightSlot[] | null;
  /** [] in 5.3 — infrastructures arrive in 5.4. */
  blockers: Blocker[];
  /** Sparse manual overrides, keyed "row,col" — they win over computation. */
  overrides: Record<string, ExposureCategory>;
  season: Season;
  /** When present: per-moment lit/shadowed mode instead of the aggregate. */
  moment?: Moment;
}

/**
 * Which of the three moments a cell is lit at (aggregate mode).
 *
 * SMA-309: the aggregate category ALONE cannot answer "when is this cell
 * sunny" — `aggregateExposure` maps both {morning, noon, evening} and the
 * ratified noon-only case to 'full', so any enumeration derived from the
 * category would be a guess. The aggregate pass already computes the three
 * shadow sets internally, so surfacing the triplet it used costs nothing;
 * the panel renders an EXACT sentence or none at all.
 *
 * `null` for a cell whose category does not come from the sun path — an
 * inactive cell, an indoor garden (schedule-driven, no moments), or a manual
 * override (which replaces the category, so the physical triplet would
 * contradict the label shown).
 */
export interface MomentsLit {
  morning: boolean;
  noon: boolean;
  evening: boolean;
}

export type ExposureGridResult =
  | {
      mode: 'aggregate';
      cells: (ExposureCategory | null)[][];
      momentsLit: (MomentsLit | null)[][];
    }
  | { mode: 'moment'; moment: Moment; cells: (CellMomentState | null)[][] };

// ── Sun directions (engraved) ────────────────────────────────────────────────
// Compass direction the sun sits in, per moment. Northern hemisphere: noon sun
// in the south; southern: noon sun in the north. Morning/evening are E/W in
// both. The "never lit" side (N resp. S) follows from these.
const SUN_DIRECTION: Record<Hemisphere, Record<Moment, Orientation>> = {
  N: { morning: 'E', noon: 'S', evening: 'W' },
  S: { morning: 'E', noon: 'N', evening: 'W' },
};

/** Compass direction of the sun for a given moment and hemisphere. */
export function sunDirection(moment: Moment, hemisphere: Hemisphere): Orientation {
  return SUN_DIRECTION[hemisphere][moment];
}

// ── Orientation → grid-side mapping (locked 15/07) ───────────────────────────
// `orientation` = the compass direction the BOTTOM edge of the grid faces.
// Oriented S ⇒ North is up ⇒ screen-right = East. In compass bearings
// (N=0, E=90, S=180, W=270): bottom=θ, left=θ+90, top=θ+180, right=θ+270.
const BEARING: Record<Orientation, number> = { N: 0, E: 90, S: 180, W: 270 };

/**
 * Grid delta (dRow, dCol) a shadow extends along, for a sun sitting in
 * compass direction `sun` on a grid whose bottom edge faces `orientation`.
 * The shadow goes AWAY from the sun.
 */
function shadowDelta(sun: Orientation, orientation: Orientation): [number, number] {
  const rel = (BEARING[sun] - BEARING[orientation] + 360) % 360;
  switch (rel) {
    case 0:
      return [-1, 0]; // sun at the bottom side → shadow goes up
    case 90:
      return [0, 1]; // sun at the left side → shadow goes right
    case 180:
      return [1, 0]; // sun at the top side → shadow goes down
    default:
      return [0, -1]; // 270: sun at the right side → shadow goes left
  }
}

// ── Shadow-length table (ratified — SMA-17 harvest #176; v32 §0.3.25) ────────
// Discrete lengths in CELLS at latitudeBand 'mid':
//   low (≤0.5m):            0 summer / 1 winter
//   mid (~1-2m wall/fence): 1 summer / 2 winter
//   tall (≥2m tree/bldg):   2 summer / 3 winter
// latitudeBand 'low' subtracts 1 (floor 0); 'high' adds 1.
const SHADOW_LENGTH_MID: Record<HeightCategory, Record<Season, number>> = {
  low: { summer: 0, winter: 1 },
  mid: { summer: 1, winter: 2 },
  tall: { summer: 2, winter: 3 },
};

/** Shadow length in cells — the discrete (height × season × band) table. */
export function shadowLength(
  height: HeightCategory,
  season: Season,
  latitudeBand: LatitudeBand
): number {
  const base = SHADOW_LENGTH_MID[height][season];
  if (latitudeBand === 'low') return Math.max(0, base - 1);
  if (latitudeBand === 'high') return base + 1;
  return base;
}

// ── Aggregation (noon-pivot) ─────────────────────────────────────────────────
/**
 * Aggregate the three per-moment lit states into a category.
 * Mockup-grounded contract: all three lit → full; morning+noon → morning;
 * noon+evening → afternoon; noon blocked → shade (regardless of the sides).
 * Ratified (SMA-17 harvest #176; v32 §0.3.25) for the non-mockup combo:
 * noon-only → full (best remaining light). All 8 combinations are pinned by
 * tests.
 */
export function aggregateExposure(lit: {
  morning: boolean;
  noon: boolean;
  evening: boolean;
}): ExposureCategory {
  if (!lit.noon) return 'shade';
  if (lit.morning && lit.evening) return 'full';
  if (lit.morning) return 'morning';
  if (lit.evening) return 'afternoon';
  return 'full'; // ratified: noon-only
}

// ── Indoor short-circuit (ratified thresholds — SMA-17 harvest #176) ─────────
// Indoor gardens (gardenType='indoor'): the lightSchedule replaces the sun
// entirely and applies UNIFORMLY to the grid. Ratified mapping of total lit
// hours/day: ≥8h → full; 4–8h → morning (partial); <4h → shade. 'afternoon'
// is unused for indoor. Malformed/null slots contribute 0 (same structural
// guard as the dialog's hydration filter, R6).
function indoorCategory(lightSchedule: LightSlot[] | null): ExposureCategory {
  const total = (lightSchedule ?? [])
    .filter(
      (slot): slot is LightSlot =>
        !!slot && typeof slot.start === 'string' && typeof slot.end === 'string'
    )
    .reduce((sum, slot) => sum + slotHours(slot), 0);
  if (total >= 8) return 'full';
  if (total >= 4) return 'morning';
  return 'shade';
}

// ── Defaults at READ time (engraved) ─────────────────────────────────────────
// hemisphere null → 'N'; latitudeBand null → 'mid'; orientation null → 'S'
// (the dialog default); gardenType null → outdoor semantics. Unknown strings
// fall back to the same defaults (defensive — the wire is validated, but the
// engine never throws on bad data).
function normalizeOrientation(value: string | null): Orientation {
  return value === 'N' || value === 'E' || value === 'S' || value === 'W'
    ? value
    : 'S';
}
function normalizeHemisphere(value: string | null): Hemisphere {
  return value === 'S' ? 'S' : 'N';
}
function normalizeBand(value: string | null): LatitudeBand {
  return value === 'low' || value === 'high' ? value : 'mid';
}

// ── Shadow casting ───────────────────────────────────────────────────────────
/**
 * Cells shadowed at a given moment: every blocksLight blocker casts a ray of
 * `shadowLength` cells from each footprint cell, away from the sun, clipped
 * to the grid. A blocker never shadows its OWN footprint (the object is not
 * in its own shadow); it can shadow another blocker's cells.
 */
function shadowedSetFor(
  moment: Moment,
  rows: number,
  cols: number,
  blockers: Blocker[],
  orientation: Orientation,
  hemisphere: Hemisphere,
  latitudeBand: LatitudeBand,
  season: Season
): Set<string> {
  const sun = sunDirection(moment, hemisphere);
  const [dRow, dCol] = shadowDelta(sun, orientation);
  const shadowed = new Set<string>();
  for (const blocker of blockers) {
    if (!blocker.blocksLight) continue;
    const length = shadowLength(blocker.heightCategory, season, latitudeBand);
    if (length === 0) continue;
    const inFootprint = (r: number, c: number): boolean =>
      r >= blocker.row &&
      r < blocker.row + blocker.spanRows &&
      c >= blocker.col &&
      c < blocker.col + blocker.spanCols;
    for (let fr = blocker.row; fr < blocker.row + blocker.spanRows; fr++) {
      for (let fc = blocker.col; fc < blocker.col + blocker.spanCols; fc++) {
        for (let i = 1; i <= length; i++) {
          const r = fr + dRow * i;
          const c = fc + dCol * i;
          if (r < 0 || r >= rows || c < 0 || c >= cols) break; // clipped
          if (inFootprint(r, c)) continue;
          shadowed.add(`${r},${c}`);
        }
      }
    }
  }
  return shadowed;
}

// ── Main entry point ─────────────────────────────────────────────────────────
export function computeExposureGrid(params: ExposureParams): ExposureGridResult {
  const { rows, cols, activeCells, blockers, season } = params;
  const orientation = normalizeOrientation(params.orientation);
  const hemisphere = normalizeHemisphere(params.hemisphere);
  const latitudeBand = normalizeBand(params.latitudeBand);
  const isIndoor = params.gardenType === 'indoor';
  const isActive = (r: number, c: number): boolean =>
    activeCells[r]?.[c] === true;

  if (params.moment) {
    // Moment mode: per-moment lit/shadowed states (5.3-D moment presets).
    // Category overrides do NOT apply here — they override the AGGREGATE
    // category, not a physical moment state (pinned by test).
    const moment = params.moment;
    const cells: (CellMomentState | null)[][] = [];
    if (isIndoor) {
      // Ratified: artificial light has no sun path — uniformly 'lit' unless
      // the schedule aggregates to shade (consistent with the uniform
      // category), then uniformly 'shadowed'.
      const state: CellMomentState =
        indoorCategory(params.lightSchedule) === 'shade' ? 'shadowed' : 'lit';
      for (let r = 0; r < rows; r++) {
        cells[r] = [];
        for (let c = 0; c < cols; c++) {
          cells[r][c] = isActive(r, c) ? state : null;
        }
      }
      return { mode: 'moment', moment, cells };
    }
    const shadowed = shadowedSetFor(
      moment, rows, cols, blockers, orientation, hemisphere, latitudeBand, season
    );
    for (let r = 0; r < rows; r++) {
      cells[r] = [];
      for (let c = 0; c < cols; c++) {
        cells[r][c] = isActive(r, c)
          ? shadowed.has(`${r},${c}`)
            ? 'shadowed'
            : 'lit'
          : null;
      }
    }
    return { mode: 'moment', moment, cells };
  }

  // Aggregate mode: the 4-category grid. Precedence per cell:
  // inactive → null; manual override → override; indoor → uniform; computed.
  const cells: (ExposureCategory | null)[][] = [];
  // SMA-309: the triplet each computed category came from, surfaced so a
  // caller can state WHEN a cell is lit without re-deriving (and without
  // guessing — see MomentsLit). Stays null wherever the category did not come
  // from the sun path: inactive, override, indoor.
  const momentsLit: (MomentsLit | null)[][] = [];
  const uniformIndoor = isIndoor ? indoorCategory(params.lightSchedule) : null;
  const shadowSets = isIndoor
    ? null
    : {
        morning: shadowedSetFor('morning', rows, cols, blockers, orientation, hemisphere, latitudeBand, season),
        noon: shadowedSetFor('noon', rows, cols, blockers, orientation, hemisphere, latitudeBand, season),
        evening: shadowedSetFor('evening', rows, cols, blockers, orientation, hemisphere, latitudeBand, season),
      };
  for (let r = 0; r < rows; r++) {
    cells[r] = [];
    momentsLit[r] = [];
    for (let c = 0; c < cols; c++) {
      momentsLit[r][c] = null;
      if (!isActive(r, c)) {
        cells[r][c] = null; // overrides on inactive cells are ignored
        continue;
      }
      const key = `${r},${c}`;
      const override = params.overrides[key];
      if (override) {
        cells[r][c] = override;
        continue;
      }
      if (uniformIndoor !== null) {
        cells[r][c] = uniformIndoor;
        continue;
      }
      const lit = {
        morning: !shadowSets!.morning.has(key),
        noon: !shadowSets!.noon.has(key),
        evening: !shadowSets!.evening.has(key),
      };
      momentsLit[r][c] = lit;
      cells[r][c] = aggregateExposure(lit);
    }
  }
  return { mode: 'aggregate', cells, momentsLit };
}
