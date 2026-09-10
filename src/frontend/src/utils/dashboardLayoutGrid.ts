/**
 * SMA-336 round 3 (V6) — the dashboard grid's placement, as a pure function.
 *
 * The widget grid mixes three footprints (1x1, 2x1, 2x2) declared with
 * `grid-column: span N` / `grid-row: span N` and NO `grid-auto-flow`, so the
 * browser places them with CSS Grid auto-placement in its initial `row` mode —
 * "sparse" packing. That algorithm is what this module reproduces, exactly:
 *
 * - a cursor walks the grid left to right, then top to bottom;
 * - an item is placed at the first position at or after the cursor where its
 *   whole area is free and fits inside the row;
 * - the cursor then moves to just after that item and NEVER moves backwards,
 *   so a hole an item was too wide to fill stays a hole.
 *
 * Reproducing it here is what lets the drag preview tell the truth: dnd-kit's
 * own `rectSortingStrategy` models a reorder as a PERMUTATION OF MEASURED
 * RECTS, which is only equivalent to a re-layout when every item is the same
 * size. With mixed footprints it hands a widget a box that belongs to another
 * widget — the deformation of round 2 (V4) and the drop preview landing on an
 * occupied cell (V6) are the same wrong model seen twice.
 *
 * No React, no DOM, no dnd-kit: this file is the model, and it is testable on
 * its own (`dashboardLayoutGrid.test.ts`).
 */

/** CSS Grid's two packing modes. The dashboard uses `sparse` (the initial value). */
export type GridFlow = 'sparse' | 'dense';

export interface GridSpan {
  /** Column span, in cells. */
  cols: number;
  /** Row span, in cells. */
  rows: number;
}

export interface GridItem extends GridSpan {
  key: string;
}

/** A cell coordinate. ZERO-based, unlike CSS grid lines. */
export interface GridCell {
  col: number;
  row: number;
}

export interface GridPlacement extends GridCell, GridSpan {}

export interface GridTranslation {
  x: number;
  y: number;
}

/**
 * The footprint of each widget size at full width (`_spec.md` § 1): Small
 * 1x1, Medium 2x1, Large 2x2. The single source of truth for both the CSS
 * (`SortableWidget`) and the model (`packGrid`) — they must not drift.
 */
export const DASHBOARD_BASE_SPANS = {
  small: { cols: 1, rows: 1 },
  medium: { cols: 2, rows: 1 },
  large: { cols: 2, rows: 2 },
} as const;

export type DashboardSpanSize = keyof typeof DASHBOARD_BASE_SPANS;

/**
 * The footprint a size actually gets in a grid of `columns` columns. CSS Grid
 * clamps a span to the number of columns, which is exactly what makes a Medium
 * and a Large one column wide on a phone.
 */
export function spanFor(size: DashboardSpanSize, columns: number): GridSpan {
  const base = DASHBOARD_BASE_SPANS[size];
  const width = Math.max(1, Math.floor(columns));
  return { cols: Math.min(base.cols, width), rows: base.rows };
}

/**
 * Places `items`, in order, in a grid of `columns` columns, and returns each
 * item's cell and span by key.
 *
 * `sparse` is the browser's behaviour for this grid. `dense` is CSS Grid's
 * `grid-auto-flow: row dense`, where the search restarts at the top of the grid
 * for every item and a later small item CAN backfill an earlier hole; it is
 * implemented so the model stays complete and honest about the difference, and
 * it is exercised by its own test.
 */
export function packGrid(
  items: readonly GridItem[],
  columns: number,
  flow: GridFlow = 'sparse'
): Map<string, GridPlacement> {
  const width = Math.max(1, Math.floor(columns));
  const occupied: boolean[][] = [];

  const lineAt = (row: number): boolean[] => {
    while (occupied.length <= row) occupied.push(new Array<boolean>(width).fill(false));
    return occupied[row]!;
  };

  const fits = (row: number, col: number, cols: number, rows: number): boolean => {
    for (let r = row; r < row + rows; r += 1) {
      const line = lineAt(r);
      for (let c = col; c < col + cols; c += 1) {
        if (line[c]) return false;
      }
    }
    return true;
  };

  const occupy = (row: number, col: number, cols: number, rows: number): void => {
    for (let r = row; r < row + rows; r += 1) {
      const line = lineAt(r);
      for (let c = col; c < col + cols; c += 1) line[c] = true;
    }
  };

  const placements = new Map<string, GridPlacement>();
  let cursorRow = 0;
  let cursorCol = 0;

  for (const item of items) {
    const cols = Math.min(Math.max(1, Math.floor(item.cols)), width);
    const rows = Math.max(1, Math.floor(item.rows));

    // Dense restarts the scan at the origin for every item; sparse resumes at
    // the cursor, which is what leaves holes behind.
    let row = flow === 'dense' ? 0 : cursorRow;
    let col = flow === 'dense' ? 0 : cursorCol;

    for (;;) {
      if (col + cols > width) {
        col = 0;
        row += 1;
        continue;
      }
      if (fits(row, col, cols, rows)) break;
      col += 1;
    }

    occupy(row, col, cols, rows);
    placements.set(item.key, { col, row, cols, rows });

    if (flow === 'sparse') {
      cursorRow = row;
      cursorCol = col + cols;
    }
  }

  return placements;
}

/**
 * The pixel displacement of an element between two cells, for a grid whose
 * cells are `cellWidth` x `rowHeight` with `gap` between them.
 *
 * A pure delta: it needs no grid origin, which is what lets the drag transform
 * be computed without ever measuring the container.
 */
export function translationFor(
  from: GridCell,
  to: GridCell,
  cellWidth: number,
  rowHeight: number,
  gap: number
): GridTranslation {
  return {
    x: (to.col - from.col) * (cellWidth + gap),
    y: (to.row - from.row) * (rowHeight + gap),
  };
}

/**
 * The same reorder dnd-kit performs on drop: the item at `from` moved to `to`,
 * every other item keeping its relative order. Kept here so the model can
 * compute a TARGET layout without importing dnd-kit.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}
