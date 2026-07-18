import type { Blocker, HeightCategory } from './exposure';

/**
 * Infrastructures (SMA-15, phase 5.4) — PURE helpers, no React, no I/O.
 * Storage stays PER-CELL (`CellData.infrastructure`, painted like shape-edit);
 * the mockup's multi-cell look (one perimeter border + one centered label) and
 * the exposure blockers are both derived HERE by grouping adjacent same-type
 * cells into rectangular regions. No table, no migration, no backend change.
 */

/** The 6 types (mission SMA-15). Order = the sidebar INFRAS. list order. */
export const INFRASTRUCTURE_TYPES = [
  'wall',
  'fence',
  'trellis',
  'path',
  'water',
  'pot',
] as const;

export type InfrastructureType = (typeof INFRASTRUCTURE_TYPES)[number];

/**
 * Runtime guard at the JSON boundary (same contract as isExposureCategory,
 * 5.3-C R2): persisted CellsJson may carry anything — an unknown value must be
 * dropped, never enter CellData as a fake InfrastructureType.
 */
export function isInfrastructureType(
  value: unknown
): value is InfrastructureType {
  return (INFRASTRUCTURE_TYPES as readonly unknown[]).includes(value);
}

/**
 * Per-type engine + sidebar facts. Blocker mapping is the SMA-15 dictation:
 * wall → blocks, 'tall'; fence → blocks, 'mid' (the engine table's own
 * anchor: "mid (~1-2m wall/fence)"); trellis → blocks, 'tall' (the §6
 * "garni" trellis blocks like a wall per its badge); path/water/pot → the §6
 * "Pas d'ombre" badge, never a blocker. Icons are the §6 Material Symbols
 * (fence: PROPOSED — no §6 row yet, ratification at harvest).
 */
export const INFRA_META: Record<
  InfrastructureType,
  { icon: string; blocksLight: boolean; heightCategory?: HeightCategory }
> = {
  wall: { icon: 'foundation', blocksLight: true, heightCategory: 'tall' },
  fence: { icon: 'fence', blocksLight: true, heightCategory: 'mid' },
  trellis: { icon: 'grid_on', blocksLight: true, heightCategory: 'tall' },
  path: { icon: 'route', blocksLight: false },
  water: { icon: 'water_drop', blocksLight: false },
  pot: { icon: 'potted_plant', blocksLight: false },
};

/** One rendered block / blocker footprint: a same-type rectangle of cells. */
export interface InfraRegion {
  type: InfrastructureType;
  startRow: number;
  startCol: number;
  spanRows: number;
  spanCols: number;
}

/** Structural cell view — matches CellData without importing it (the types
 * module imports THIS module's guard; a value import back would be a cycle). */
interface InfraCell {
  active: boolean;
  infrastructure?: string;
}

/**
 * Group same-type infrastructure cells into RECTANGULAR regions: maximal
 * horizontal runs per row, then runs stacking exactly (same type, same
 * startCol, same span) merge vertically. A straight line is always ONE
 * region; an L-shape decomposes into 2 rectangles (documented v1 behavior —
 * the Blocker contract is rectangular, and the render reuses the same
 * footprints so both stay consistent). Inactive cells never join a region
 * (they render cellOff; painting is active-only), and unknown stored values
 * are ignored via the same runtime guard as the JSON boundary.
 */
export function groupInfrastructureRegions(
  grid: InfraCell[][]
): InfraRegion[] {
  const regions: InfraRegion[] = [];
  /** Regions whose bottom edge touches the previous row, by startCol. */
  let prevRow = new Map<number, InfraRegion>();
  for (let r = 0; r < grid.length; r++) {
    const currRow = new Map<number, InfraRegion>();
    const row = grid[r];
    let c = 0;
    while (c < row.length) {
      const cell = row[c];
      if (!cell.active || !isInfrastructureType(cell.infrastructure)) {
        c++;
        continue;
      }
      const type = cell.infrastructure;
      const startCol = c;
      while (
        c < row.length &&
        row[c].active &&
        row[c].infrastructure === type
      ) {
        c++;
      }
      const spanCols = c - startCol;
      const above = prevRow.get(startCol);
      if (
        above &&
        above.type === type &&
        above.spanCols === spanCols &&
        above.startRow + above.spanRows === r
      ) {
        above.spanRows += 1;
        currRow.set(startCol, above);
      } else {
        const region: InfraRegion = {
          type,
          startRow: r,
          startCol,
          spanRows: 1,
          spanCols,
        };
        regions.push(region);
        currRow.set(startCol, region);
      }
    }
    prevRow = currRow;
  }
  return regions;
}

/**
 * The exposure-engine input (SMA-15 ITEM 4): every BLOCKING region expressed
 * as a Blocker footprint. Non-blocking types (path/water/pot) produce no
 * blocker at all — the engine would skip them anyway, but the derived list
 * stays minimal and the "casts nothing" contract is pinned here by tests.
 */
export function infrastructureBlockers(grid: InfraCell[][]): Blocker[] {
  return groupInfrastructureRegions(grid)
    .filter((region) => INFRA_META[region.type].blocksLight)
    .map((region) => ({
      row: region.startRow,
      col: region.startCol,
      spanRows: region.spanRows,
      spanCols: region.spanCols,
      heightCategory: INFRA_META[region.type].heightCategory!,
      blocksLight: true,
    }));
}
