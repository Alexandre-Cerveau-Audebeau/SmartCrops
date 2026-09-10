import type { ClientRect } from '@dnd-kit/core';
import { rectSortingStrategy } from '@dnd-kit/sortable';
import { describe, expect, it } from 'vitest';
import { createDashboardSortingStrategy } from './dashboardSortingStrategy';
import { packGrid, spanFor, type GridItem } from '../../utils/dashboardLayoutGrid';

// SMA-336 round 3 (V6). The render test in GardensDashboard.edit.test.tsx says
// the drop preview never sits on a widget; this file says WHY it used to, by
// putting the two strategies side by side on the same input. dnd-kit's own
// strategy is called here as the counter-example, not as a dependency of the
// fix — it is what the dashboard used until this round.

const CELL = 280;
const ROW = 200;
const GAP = 20;

/**
 * The mixed grid of the frozen design at four columns: a Small, a Large and
 * four Mediums, laid out by the same sparse packing the browser runs.
 */
const items: GridItem[] = [
  { key: 'weather', ...spanFor('small', 4) },
  { key: 'gardens', ...spanFor('large', 4) },
  { key: 'tips', ...spanFor('medium', 4) },
  { key: 'month', ...spanFor('medium', 4) },
];

function rectsFor(list: GridItem[]): ClientRect[] {
  const placed = packGrid(list, 4);
  return list.map((item) => {
    const cell = placed.get(item.key)!;
    const left = cell.col * (CELL + GAP);
    const top = cell.row * (ROW + GAP);
    const width = cell.cols * CELL + (cell.cols - 1) * GAP;
    const height = cell.rows * ROW + (cell.rows - 1) * GAP;
    return { left, top, width, height, right: left + width, bottom: top + height };
  });
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** Where each slot is drawn once the strategy's transform is applied. */
function drawn(
  strategy: ReturnType<typeof createDashboardSortingStrategy>,
  activeIndex: number,
  overIndex: number
): Record<string, Box> {
  const rects = rectsFor(items);
  const out: Record<string, Box> = {};
  items.forEach((item, index) => {
    const transform = strategy({
      rects,
      activeIndex,
      overIndex,
      index,
      activeNodeRect: rects[activeIndex] ?? null,
    });
    const rect = rects[index]!;
    const x = transform?.x ?? 0;
    const y = transform?.y ?? 0;
    out[item.key] = {
      left: rect.left + x,
      top: rect.top + y,
      right: rect.right + x,
      bottom: rect.bottom + y,
    };
  });
  return out;
}

const dashboard = createDashboardSortingStrategy({ items, columns: 4, gap: GAP });

describe('the dashboard sorting strategy — mixed footprints, four columns', () => {
  it('draws every slot on its own area: nothing overlaps the drop preview', () => {
    const boxes = drawn(dashboard, 0, 1);
    const keys = Object.keys(boxes);

    const collisions = keys.flatMap((a, i) =>
      keys.slice(i + 1).filter((b) => overlaps(boxes[a]!, boxes[b]!)).map((b) => `${a}/${b}`)
    );

    expect(collisions).toEqual([]);
  });

  it('and dnd-kit’s rect strategy does not — the drop preview lands on the Large', () => {
    // The counter-example, on the very same input. `rectSortingStrategy`
    // permutes the MEASURED RECTS, so the Small is handed the Large's slot
    // while the Large keeps its own size: two boxes over the same pixels.
    const boxes = drawn(rectSortingStrategy, 0, 1);

    expect(overlaps(boxes.weather!, boxes.gardens!)).toBe(true);
  });

  it('puts the dragged widget exactly on the cell the drop will give it', () => {
    const boxes = drawn(dashboard, 0, 1);
    const target = packGrid(
      [items[1]!, items[0]!, items[2]!, items[3]!],
      4
    ).get('weather')!;

    expect(boxes.weather).toEqual({
      left: target.col * (CELL + GAP),
      top: target.row * (ROW + GAP),
      right: target.col * (CELL + GAP) + CELL,
      bottom: target.row * (ROW + GAP) + ROW,
    });
  });

  it('never emits a scale factor other than 1 (round 2, V4)', () => {
    const rects = rectsFor(items);
    for (let index = 0; index < items.length; index += 1) {
      const transform = dashboard({
        rects,
        activeIndex: 0,
        overIndex: 3,
        index,
        activeNodeRect: rects[0]!,
      });
      expect(transform).toMatchObject({ scaleX: 1, scaleY: 1 });
    }
  });

  it('translates nothing when the hovered index is the active one', () => {
    const rects = rectsFor(items);
    for (let index = 0; index < items.length; index += 1) {
      expect(
        dashboard({ rects, activeIndex: 2, overIndex: 2, index, activeNodeRect: rects[2]! })
      ).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    }
  });

  it('gives up rather than guessing when nothing has been measured', () => {
    // jsdom measures every element as a zero rect unless a test stubs the
    // geometry: a zero cell would turn every translation into a wrong number
    // instead of into no transform at all.
    const zero: ClientRect[] = items.map(() => ({
      left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0,
    }));

    expect(
      dashboard({ rects: zero, activeIndex: 0, overIndex: 1, index: 1, activeNodeRect: null })
    ).toBeNull();
  });
});
