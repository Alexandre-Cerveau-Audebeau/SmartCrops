import type { ClientRect } from '@dnd-kit/core';
import type { SortingStrategy } from '@dnd-kit/sortable';
import {
  moveItem,
  packGrid,
  rowTops,
  type GridItem,
  type GridPlacement,
} from '../../utils/dashboardLayoutGrid';

interface Options {
  /** The visible widgets, in grid order, with the span each has HERE. */
  items: GridItem[];
  /** Columns at the current breakpoint: 4 from 1200px, 2 from 600px, else 1. */
  columns: number;
  /** The grid gutter, in pixels. */
  gap: number;
}

/** What the drag preview needs of the measured grid (SMA-437, pre-flight D6). */
interface MeasuredGrid {
  /** One column's width. */
  cellWidth: number;
  /** A pinned row's height — 273 px from 600 px up; 0 when no item is pinned. */
  rowHeight: number;
  /** Each free-height item's own measured height, by key: its row's height. */
  freeHeights: Map<string, number>;
}

/**
 * The grid's geometry, read on the measured widgets rather than on the
 * container — dnd-kit's `SortingStrategy` is handed `activeNodeRect`, the
 * ACTIVE item's rect, and `rects`, the measured item rects, aligned with
 * `items`; there is no container rect in its arguments.
 *
 * A widget of span `c` x `r` is `c * cellWidth + (c - 1) * gap` wide, so any
 * measured widget gives the column width. The row height is NOT one number
 * any more (SMA-437, A-N10): a Full-width row is as tall as its content. So
 * the pinned row height is read on a PINNED widget, `r * rowHeight + (r - 1)
 * * gap` tall, and each free row's height on ITS OWN widget's rect — the
 * model of round 3 took the first measured widget for all rows, and when that
 * widget was a 180 px band, every row was taken for 180 px (the pre-flight:
 * 544 wrong couples of 776, up to 744 px on the desktop).
 *
 * Returns null when a height the layout needs was not measured — jsdom
 * measures every element as a zero rect unless a test stubs the geometry, and
 * a zero cell would turn every translation into 0 rather than into a wrong
 * number.
 */
function measuredGrid(rects: ClientRect[], items: GridItem[], gap: number): MeasuredGrid | null {
  let cellWidth: number | null = null;
  let rowHeight: number | null = null;
  const freeHeights = new Map<string, number>();

  for (let i = 0; i < items.length; i += 1) {
    const rect = rects[i];
    const item = items[i];
    if (!rect || !item || rect.width <= 0 || rect.height <= 0) continue;
    cellWidth ??= (rect.width - (item.cols - 1) * gap) / item.cols;
    if (item.freeHeight) freeHeights.set(item.key, rect.height);
    else rowHeight ??= (rect.height - (item.rows - 1) * gap) / item.rows;
  }

  if (cellWidth === null || cellWidth <= 0) return null;
  if (items.some((item) => item.freeHeight && !freeHeights.has(item.key))) return null;
  const pinnedRows = items.some((item) => !item.freeHeight);
  if (pinnedRows && (rowHeight === null || rowHeight <= 0)) return null;
  return { cellWidth, rowHeight: rowHeight ?? 0, freeHeights };
}

/**
 * SMA-336 round 3 (V6) — the dashboard's own sorting strategy.
 *
 * dnd-kit's `rectSortingStrategy` answers "where does this item go?" by
 * PERMUTING THE MEASURED RECTS: it moves the rect array and hands item `index`
 * whichever rect now sits at its position. That is only the same thing as a
 * re-layout when every item is the same size. This grid mixes 1x1, 2x1 and 2x2
 * footprints, so the answer was wrong in two visible ways — a widget drawn at
 * another widget's proportions (round 2, V4, fixed by dropping the scale), and
 * a drop preview sitting on top of a widget that is still there (V6).
 *
 * This strategy answers the same question by LAYING THE GRID OUT TWICE: the
 * current order, and the order with the active item moved to the hovered
 * index, both through `packGrid` — the same sparse auto-placement the browser
 * runs. Every item, the dragged one included, is then translated from the cell
 * it occupies to the cell it will occupy. Two consequences fall out rather than
 * being arranged:
 *
 * - the neighbours move to exactly where the drop will leave them, holes and
 *   wrapped rows included;
 * - the dragged widget's own slot — the dashed drop preview — lands on the
 *   area it will occupy, which `packGrid` leaves free by construction, so the
 *   preview can no longer overlap a widget in place.
 *
 * The transform NEVER carries a scale factor. `SortableWidget` also applies it
 * with `CSS.Translate.toString`, so the round-2 guarantee holds at both ends.
 *
 * SMA-437 (pre-flight D6) — the rows are measured ROW BY ROW: a Full-width
 * row is as tall as its content, so a widget moves from the top of its row in
 * the current layout to the top of its row in the target one, each computed
 * from the heights of the rows above it in THAT layout (`rowTops`) — the
 * gesture the phone's `verticalListSortingStrategy` already makes, carried to
 * the grid. Without a Full width every row is pinned and the translation is
 * exactly round 3's `(row delta) × (row + gap)`.
 */
export function createDashboardSortingStrategy({
  items,
  columns,
  gap,
}: Options): SortingStrategy {
  // The current layout does not depend on the drag: pack it once.
  const current = packGrid(items, columns, 'sparse');

  // One-entry memo: dnd-kit calls the strategy once per item on every
  // drag-over, and the target layout is the same for all of them.
  let cachedKey = '';
  let cachedTarget: Map<string, GridPlacement> | null = null;

  const targetFor = (activeIndex: number, overIndex: number) => {
    const key = `${activeIndex}:${overIndex}`;
    if (cachedTarget && cachedKey === key) return cachedTarget;
    cachedKey = key;
    cachedTarget = packGrid(moveItem(items, activeIndex, overIndex), columns, 'sparse');
    return cachedTarget;
  };

  // One-entry memo per hover (SMA-437 lot 1, PR B, S3): the measured grid and
  // the row tops of both layouts are the same for every item of one
  // drag-over. Keyed on the `rects` array too — dnd-kit hands a new one when
  // it measures again, and a new measure is a new grid.
  let hoverRects: ClientRect[] | null = null;
  let hoverKey = '';
  let hoverRows: { grid: MeasuredGrid; fromTops: number[]; toTops: number[] } | null = null;

  const rowsFor = (rects: ClientRect[], activeIndex: number, overIndex: number) => {
    const key = `${activeIndex}:${overIndex}`;
    if (hoverRects === rects && hoverKey === key) return hoverRows;
    hoverRects = rects;
    hoverKey = key;
    const grid = measuredGrid(rects, items, gap);
    hoverRows = grid && {
      grid,
      fromTops: rowTops(current, grid.freeHeights, grid.rowHeight, gap),
      toTops: rowTops(targetFor(activeIndex, overIndex), grid.freeHeights, grid.rowHeight, gap),
    };
    return hoverRows;
  };

  return ({ rects, activeIndex, overIndex, index }) => {
    const item = items[index];
    if (!item) return null;

    const target = targetFor(activeIndex, overIndex);
    const from = current.get(item.key);
    const to = target.get(item.key);
    if (!from || !to) return null;

    const rows = rowsFor(rects, activeIndex, overIndex);
    if (!rows) return null;
    const { grid } = rows;

    const fromTop = rows.fromTops[from.row];
    const toTop = rows.toTops[to.row];
    if (fromTop === undefined || toTop === undefined) return null;

    return {
      x: (to.col - from.col) * (grid.cellWidth + gap),
      y: toTop - fromTop,
      scaleX: 1,
      scaleY: 1,
    };
  };
}
