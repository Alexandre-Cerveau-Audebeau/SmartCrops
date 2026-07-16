import type { ExposureCategory } from '../utils/exposure';

export interface CellData {
  active: boolean;
  soil?: string;
  infrastructure?: string;
  /**
   * Manual per-cell exposure override (SMA-17 5.3-C): wins over the computed
   * category in the exposure engine. TYPE-ONLY in 5.3 — the override UI ships
   * in 5.3-D; sparse like soil/infrastructure (absent = no override).
   */
  exposureOverride?: ExposureCategory;
}

// Runtime guard at the JSON boundary (SMA-17 5.3-C R2): the TypeScript
// annotation alone does not validate persisted JSON — a malformed override
// must be dropped here, never enter CellData as a fake ExposureCategory.
function isExposureCategory(value: unknown): value is ExposureCategory {
  return value === 'full' || value === 'morning' || value === 'afternoon' || value === 'shade';
}

export function parseCellsJson(json: string | null, width: number, height: number): CellData[][] {
  const grid: CellData[][] = [];
  for (let r = 0; r < height; r++) {
    grid[r] = [];
    for (let c = 0; c < width; c++) {
      grid[r][c] = { active: true };
    }
  }
  if (!json) return grid;
  try {
    const cells: Array<{ row: number; col: number; active?: boolean; soil?: string; infrastructure?: string; exposureOverride?: unknown }> = JSON.parse(json);
    for (const cell of cells) {
      if (cell.row >= 0 && cell.row < height && cell.col >= 0 && cell.col < width) {
        grid[cell.row][cell.col] = {
          active: cell.active !== false,
          soil: cell.soil,
          infrastructure: cell.infrastructure,
          ...(isExposureCategory(cell.exposureOverride) && { exposureOverride: cell.exposureOverride }),
        };
      }
    }
  } catch { /* ignore invalid JSON */ }
  return grid;
}

export function serializeCellsJson(grid: CellData[][]): string | null {
  const cells: Array<{ row: number; col: number; active?: boolean; soil?: string; infrastructure?: string; exposureOverride?: ExposureCategory }> = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c];
      if (!cell.active || cell.soil || cell.infrastructure || cell.exposureOverride) {
        cells.push({
          row: r,
          col: c,
          ...(cell.active === false && { active: false }),
          ...(cell.soil && { soil: cell.soil }),
          ...(cell.infrastructure && { infrastructure: cell.infrastructure }),
          ...(cell.exposureOverride && { exposureOverride: cell.exposureOverride }),
        });
      }
    }
  }
  return cells.length > 0 ? JSON.stringify(cells) : null;
}
