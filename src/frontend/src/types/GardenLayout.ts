export interface CellData {
  active: boolean;
  soil?: string;
  infrastructure?: string;
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
    const cells: Array<{ row: number; col: number; active?: boolean; soil?: string; infrastructure?: string }> = JSON.parse(json);
    for (const cell of cells) {
      if (cell.row >= 0 && cell.row < height && cell.col >= 0 && cell.col < width) {
        grid[cell.row][cell.col] = {
          active: cell.active !== false,
          soil: cell.soil,
          infrastructure: cell.infrastructure,
        };
      }
    }
  } catch { /* ignore invalid JSON */ }
  return grid;
}

export function serializeCellsJson(grid: CellData[][]): string | null {
  const cells: Array<{ row: number; col: number; active?: boolean; soil?: string; infrastructure?: string }> = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c];
      if (!cell.active || cell.soil || cell.infrastructure) {
        cells.push({
          row: r,
          col: c,
          ...(cell.active === false && { active: false }),
          ...(cell.soil && { soil: cell.soil }),
          ...(cell.infrastructure && { infrastructure: cell.infrastructure }),
        });
      }
    }
  }
  return cells.length > 0 ? JSON.stringify(cells) : null;
}
