import type { PlacementData } from '../services/gardenLayoutApi';
import { parseCellsJson } from '../types/GardenLayout';
import { clipPlacement } from './gardenStats';
import type {
  PreviewPlacement,
  PreviewPlan,
  TemplateCell,
} from './gardenTemplates';

/**
 * SMA-336 PR 2/5 — turning a REAL garden into something `TemplatePreview` can
 * draw.
 *
 * The dashboard needs a plan thumbnail in two places the frozen design fixes: a
 * 48 px square on a Gardens card, and a 2 px-per-cell sketch in the identity
 * cell of the comparison table. `TemplatePreview` already draws exactly that —
 * it was written for the three garden templates — and this module is the
 * adapter that lets it draw a garden instead, plus the sizing rule the
 * thumbnail needs to fit a box it did not choose.
 *
 * Both functions are PURE: no React, no DOM measurement, no clock. The fitting
 * rule in particular is arithmetic on four numbers rather than a
 * ResizeObserver, which is what makes it testable at the two sizes the design
 * actually asks for.
 */

/** Below this cell size the plant block loses its inset — see {@link plantInsetPx}. */
export const TINY_CELL_PX = 4;

/**
 * Inset of a plant block inside its cells, in px.
 *
 * Two pixels normally, and ZERO at or below a four-pixel cell. The frozen design
 * spells out why: at the 2 px cells of the Large comparison table, a 1×1 plant
 * inset by 2 px on each side measures 2 − 4 = 0 and the thumbnail stops showing
 * any planting at all. The margin is what makes blocks readable at 16 px and
 * what erases them at 2 px, so it is conditional rather than constant.
 *
 * The threshold is INCLUSIVE (round 1, G9). At exactly 4 px the two 2 px margins
 * consume the whole track — 4 − 2 − 2 = 0 — so the strict comparison erased the
 * plant at the one size it was meant to protect. Four is the first cell size at
 * which a block survives the inset only if it does not get one.
 */
export function plantInsetPx(cellPx: number): number {
  return cellPx <= TINY_CELL_PX ? 0 : 2;
}

/** How to draw a plan inside a box: cell edge and gap, both in whole px. */
export interface PreviewFit {
  cellPx: number;
  /** Gap between cells AND padding around the grid — 1 normally, 0 when nothing else fits. */
  gapPx: number;
}

/** Largest whole-pixel cell that fits, for a KNOWN gap. */
function fitWithGap(
  cols: number,
  rows: number,
  maxW: number,
  maxH: number,
  gap: number
): number {
  const byWidth = (maxW - gap * (cols + 1)) / cols;
  const byHeight = (maxH - gap * (rows + 1)) / rows;
  return Math.floor(Math.min(byWidth, byHeight));
}

/**
 * How to draw `cols × rows` inside `maxW × maxH`.
 *
 * It answers the cell AND the gap together, and that pairing is the whole point.
 * A gap rule keyed on the cell size alone cannot work here, because the gap is
 * part of what decides the cell size: measuring with a one-pixel gap can return
 * a cell whose own rule then asks for no gap, and measuring without one can
 * return a cell whose rule then asks for a gap that no longer fits. Returning
 * both removes the circle — the caller draws exactly what was measured.
 *
 * The rule itself is simple: keep the one-pixel gap whenever a cell still fits
 * beside it, and drop it only when it would leave nothing. The frozen design's
 * own target shows why the second case is real rather than theoretical — a
 * 48 px thumbnail of a 40-column garden owes 41 gaps, which is 81 px before a
 * single cell gets its pixel.
 *
 * Whole pixels because the preview is a CSS grid of fixed tracks: a fractional
 * track rounds per cell and the drift shows up as a ragged right edge. Never
 * below one — a zero-pixel cell renders nothing, and a thumbnail that draws a
 * 200 × 200 garden too small to read is more honest than one that draws it not
 * at all.
 */
export function fitPreview(
  cols: number,
  rows: number,
  maxW: number,
  maxH: number
): PreviewFit {
  if (cols <= 0 || rows <= 0) return { cellPx: 1, gapPx: 0 };
  const spaced = fitWithGap(cols, rows, maxW, maxH, 1);
  if (spaced >= 1) return { cellPx: spaced, gapPx: 1 };
  return { cellPx: Math.max(1, fitWithGap(cols, rows, maxW, maxH, 0)), gapPx: 0 };
}

/**
 * A stored garden plan, as a drawable {@link PreviewPlan}.
 *
 * The cell list is rebuilt through {@link parseCellsJson} rather than read
 * straight off the JSON: that function is the boundary that drops unknown soils
 * and infrastructures, clamps out-of-grid indices and survives a malformed
 * document. Re-deriving the sparse list from the grid it returns means the
 * thumbnail can only ever draw values the planner itself would draw.
 *
 * The re-sparsifying condition below is the one `serializeCellsJson` uses, on
 * purpose: a cell that would not be written is a cell that has nothing to show.
 *
 * `plantKey` is the placement's plant ID rather than its scientific name.
 * `TemplatePreview` hashes whatever string it gets into a colour, and the name
 * is nullable on the wire — every unnamed plant would otherwise share the one
 * colour of the empty string. The ID is always there, and it is the same key
 * `getPlantColor` is given everywhere else in the product, so a plant keeps its
 * colour from the planner grid to the dashboard thumbnail.
 */
export function gardenToPreview(
  cellsJson: string | null,
  width: number,
  height: number,
  placements: readonly PlacementData[]
): PreviewPlan {
  const grid = parseCellsJson(cellsJson, width, height);
  const cells: TemplateCell[] = [];

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const cell = grid[row]?.[col];
      if (!cell) continue;
      if (cell.active && !cell.soil && !cell.infrastructure) continue;
      cells.push({
        row,
        col,
        ...(cell.active === false && { active: false as const }),
        ...(cell.soil && { soil: cell.soil }),
        ...(cell.infrastructure && { infrastructure: cell.infrastructure }),
      });
    }
  }

  // CLIPPED to the plan, at both ends (round 6, partie B — the one finding
  // both Extension runs rated `major`). A stored layout may anchor a placement
  // outside the plan: the layout PUT refuses neither an overlap nor a footprint
  // past the edge, and `placementCoverage` in `gardenStats.ts` clips for
  // exactly that reason — the occupancy figures derive from a BOUNDED mask
  // (round 3, E″9). The drawing path did not clip. `TemplatePreview` renders a
  // placement as `gridRow: ${row + 1} / span ${spanRows}`, and a track past the
  // explicit ones makes CSS grid add implicit tracks; the preview box is
  // `width: fit-content`, so the thumbnail then grows past the `maxW × maxH`
  // box `fitPreview` measured — 48 px on a Gardens card, and in the Large table
  // identity cell it changes the row height. One malformed stored placement
  // moved the layout of the whole list.
  //
  // The adapter is the boundary: every drawable plan passes through here, and
  // it already re-derives its cells through `parseCellsJson` for the same
  // reason. A footprint that lands fully outside is dropped, one that crosses
  // the edge is cut at it, one that overlaps another is left to overlap — the
  // grid stacks them, which is what the planner draws too.
  //
  // The clip itself is `clipPlacement` in `gardenStats` (round 7, S41 —
  // Extension #7-27), the SAME one `placementCoverage` counts occupancy with:
  // the picture and the figure cannot disagree about where a footprint ends.
  const drawn: PreviewPlacement[] = [];
  for (const placement of placements) {
    const box = clipPlacement(placement, height, width);
    if (!box) continue;
    drawn.push({ plantKey: placement.plantId, ...box });
  }

  return { cols: width, rows: height, cells, placements: drawn };
}
