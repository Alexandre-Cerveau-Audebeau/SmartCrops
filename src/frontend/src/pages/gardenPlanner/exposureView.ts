import type { Garden } from '../../types/Garden';
import type { CellData } from '../../types/GardenLayout';
import {
  computeExposureGrid,
  type Blocker,
  type ExposureCategory,
  type Moment,
  type MomentsLit,
  type Season,
} from '../../utils/exposure';

/**
 * The planner's derived exposure layers (SMA-17 5.3-D, 5.4, SMA-309) — the
 * two engine calls the page used to make inline, extracted with SMA-18 lot 3
 * so the plan export can force the SAME computation without the page's
 * `needExposure` gate (the screen computes only while the layer is visible
 * or a placement is selected; an export ticks its own box). PURE: no React,
 * no state — one source feeding the screen and both exports.
 */
export interface ExposureViewInput {
  grid: CellData[][];
  rows: number;
  cols: number;
  /** The loaded garden (null before the fetch lands — the engine's defaults apply). */
  garden: Garden | null;
  /** Blocking infrastructure regions (infrastructureBlockers). */
  blockers: Blocker[];
  season: Season;
  moment: Moment;
  /** True when something casts — the moment pass (the §9 "Ombre portée"
   * hatch) runs only then; indoor gardens are schedule-driven. */
  castsShadow: boolean;
}

export interface ExposureView {
  /** Aggregate §3 categories (overrides applied), null per inactive cell. */
  cells: (ExposureCategory | null)[][] | null;
  /** Per-cell moment triplet the aggregate came from (SMA-309). */
  momentsLit: (MomentsLit | null)[][] | null;
  /** Cells shadowed at the selected moment, or null when nothing casts. */
  cast: boolean[][] | null;
}

/** Runs the aggregate pass, plus the moment pass when something casts. */
export function computeExposureView(input: ExposureViewInput): ExposureView {
  const { grid, rows, cols, garden, blockers, season, moment, castsShadow } =
    input;
  const overrides: Record<string, ExposureCategory> = {};
  grid.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell.exposureOverride) overrides[`${r},${c}`] = cell.exposureOverride;
    })
  );
  const params = {
    rows,
    cols,
    activeCells: grid.map((row) => row.map((cell) => cell.active)),
    orientation: garden?.orientation ?? null,
    hemisphere: garden?.hemisphere ?? null,
    latitudeBand: garden?.latitudeBand ?? null,
    gardenType: garden?.gardenType ?? null,
    lightSchedule: garden?.lightSchedule ?? null,
    blockers,
    overrides,
    season,
  };
  const aggregate = computeExposureGrid(params);
  const momentResult = castsShadow
    ? computeExposureGrid({ ...params, moment })
    : null;
  return {
    cells: aggregate.mode === 'aggregate' ? aggregate.cells : null,
    momentsLit: aggregate.mode === 'aggregate' ? aggregate.momentsLit : null,
    cast:
      momentResult && momentResult.mode === 'moment'
        ? momentResult.cells.map((row) =>
            row.map((cellState) => cellState === 'shadowed')
          )
        : null,
  };
}
