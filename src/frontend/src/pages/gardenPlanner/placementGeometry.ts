import type { CellData } from '../../types/GardenLayout';
import { spacingToCm } from '../../utils/plantDetail';
import type { PlannerPlacement } from './plannerReducer';

// SMA-193 (5.5 lot 1) — pure placement geometry: footprint rectangles, the
// fit predicate guarding ADD_PLACEMENT, and the spacing→cells rule that sizes
// a plant's footprint from its Perenual spacing. No React, no state — the
// reducer and the page both call in here so the guard and the UI can never
// disagree (same single-source principle as groupInfrastructureRegions).

/** A footprint rectangle in grid coordinates — the shared placement shape. */
export interface FootprintRect {
  startRow: number;
  startCol: number;
  spanRows: number;
  spanCols: number;
}

/** True when the two rectangles share at least one cell. Touching edges
 * (adjacent rows/columns) do NOT overlap. */
export function rectsOverlap(a: FootprintRect, b: FootprintRect): boolean {
  return (
    a.startRow < b.startRow + b.spanRows &&
    b.startRow < a.startRow + a.spanRows &&
    a.startCol < b.startCol + b.spanCols &&
    b.startCol < a.startCol + a.spanCols
  );
}

/** Discriminated verdict of {@link footprintFits}: `ok: true`, or the first
 * failing rule — `out-of-bounds` (crosses the grid edge), `inactive` (covers
 * a deactivated cell), or `overlap` with the offending placement's id. */
export type FootprintFitResult =
  | { ok: true }
  | { ok: false; reason: 'out-of-bounds' | 'inactive' }
  | { ok: false; reason: 'overlap'; overlapWith: string };

/**
 * Whether a candidate footprint can be placed: fully inside the grid, every
 * covered cell ACTIVE, and no other placement overlapped. Infrastructure
 * under a plant is deliberately allowed (5.4 renders the composite).
 * `ignorePlacementId` excludes the placement being moved/resized from the
 * overlap scan so it never collides with itself.
 */
export function footprintFits(
  grid: CellData[][],
  placements: PlannerPlacement[],
  candidate: FootprintRect,
  ignorePlacementId?: string
): FootprintFitResult {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (
    candidate.startRow < 0 ||
    candidate.startCol < 0 ||
    candidate.startRow + candidate.spanRows > rows ||
    candidate.startCol + candidate.spanCols > cols
  ) {
    return { ok: false, reason: 'out-of-bounds' };
  }
  for (let r = candidate.startRow; r < candidate.startRow + candidate.spanRows; r++) {
    for (let c = candidate.startCol; c < candidate.startCol + candidate.spanCols; c++) {
      if (!grid[r][c].active) return { ok: false, reason: 'inactive' };
    }
  }
  const hit = placements.find(
    (p) => p.id !== ignorePlacementId && rectsOverlap(candidate, p)
  );
  if (hit) return { ok: false, reason: 'overlap', overlapWith: hit.id };
  return { ok: true };
}

/** Cell-size wire value ('25cm' | '50cm' | '1m') to metres — moved here from
 * GardenPlanner.tsx so the page and the footprint rule share one parser. */
export function cellSizeToMeters(cellSize: string): number {
  if (cellSize === '1m') return 1;
  if (cellSize === '50cm') return 0.5;
  return 0.25;
}

/**
 * Spacing → square footprint side, in cells (SMA-193). Perenual spacing is
 * radial (plant-to-plant distance), so the footprint is N×N with
 * N = ceil(spacingCm / cellSizeCm), floored at 1 — the mockup anchor:
 * 90 cm at 50 cm/cell → 2 (Courgette 2×2). Unknown or unparseable spacing
 * places the conservative 1×1 with `known: false` (the sidebar's "1×1?").
 */
export function spacingToFootprintCells(
  spacingValue: number | null | undefined,
  spacingUnit: string | null | undefined,
  cellSize: string
): { cells: number; known: boolean } {
  const unit = spacingUnit?.trim();
  if (spacingValue == null || !unit) return { cells: 1, known: false };
  const cm = spacingToCm(spacingValue, unit);
  if (cm === null) return { cells: 1, known: false };
  const cellCm = cellSizeToMeters(cellSize) * 100;
  // Epsilon before ceil (R3): absorbs float dust from unit conversion so an
  // exactly-divisible spacing can never round UP to an extra cell.
  return { cells: Math.max(1, Math.ceil(cm / cellCm - 1e-9)), known: true };
}

/** Column index → spreadsheet letter (0 → A, 25 → Z, 26 → AA). */
export function colToLetter(col: number): string {
  let letters = '';
  let n = col;
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
}

/** Grid cell reference in the mockup's "H3" style (column letter + 1-based row). */
export function cellRef(row: number, col: number): string {
  return `${colToLetter(col)}${row + 1}`;
}
