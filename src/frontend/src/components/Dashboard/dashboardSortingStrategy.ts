import type { ClientRect } from '@dnd-kit/core';
import type { SortingStrategy } from '@dnd-kit/sortable';
import {
  moveItem,
  packGrid,
  translationFor,
  type GridItem,
} from '../../utils/dashboardLayoutGrid';

interface Options {
  /** The visible widgets, in grid order, with the span each has HERE. */
  items: GridItem[];
  /** Columns at the current breakpoint: 4 from 1200px, 2 from 600px, else 1. */
  columns: number;
  /** The grid gutter, in pixels. */
  gap: number;
}

/**
 * The cell size, derived from any measured widget rather than from the
 * container — dnd-kit's `SortingStrategy` is handed `activeNodeRect`, the
 * ACTIVE item's rect, and `rects`, the measured item rects; there is no
 * container rect in its arguments. A widget of span `c` x `r` is
 * `c * cellWidth + (c - 1) * gap` wide, so one measured widget is enough.
 *
 * Returns null when nothing has a usable size — jsdom measures every element
 * as a zero rect unless a test stubs the geometry, and a zero cell would turn
 * every translation into 0 rather than into a wrong number.
 */
function cellSizeFrom(
  rects: ClientRect[],
  items: GridItem[],
  gap: number
): { width: number; height: number } | null {
  for (let i = 0; i < items.length; i += 1) {
    const rect = rects[i];
    const item = items[i];
    if (!rect || !item || rect.width <= 0 || rect.height <= 0) continue;
    const width = (rect.width - (item.cols - 1) * gap) / item.cols;
    const height = (rect.height - (item.rows - 1) * gap) / item.rows;
    if (width > 0 && height > 0) return { width, height };
  }
  return null;
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
  let cachedTarget: ReturnType<typeof packGrid> | null = null;

  const targetFor = (activeIndex: number, overIndex: number) => {
    const key = `${activeIndex}:${overIndex}`;
    if (cachedTarget && cachedKey === key) return cachedTarget;
    cachedKey = key;
    cachedTarget = packGrid(moveItem(items, activeIndex, overIndex), columns, 'sparse');
    return cachedTarget;
  };

  return ({ rects, activeIndex, overIndex, index }) => {
    const item = items[index];
    if (!item) return null;

    const from = current.get(item.key);
    const to = targetFor(activeIndex, overIndex).get(item.key);
    if (!from || !to) return null;

    const cell = cellSizeFrom(rects, items, gap);
    if (!cell) return null;

    const { x, y } = translationFor(from, to, cell.width, cell.height, gap);
    return { x, y, scaleX: 1, scaleY: 1 };
  };
}
