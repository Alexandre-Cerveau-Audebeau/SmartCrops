import type { ClientRect } from '@dnd-kit/core';
import { rectSortingStrategy } from '@dnd-kit/sortable';
import { describe, expect, it } from 'vitest';
import { createDashboardSortingStrategy } from './dashboardSortingStrategy';
import { moveItem, packGrid, spanFor, translationFor, type GridItem } from '../../utils/dashboardLayoutGrid';

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

// ── SMA-437 lot 1, PR A, step A4 (pre-flight D6) — rows of unequal heights.
//
// A Full-width row takes the height of its content (A-N10), so the rows of the
// grid are no longer one height. The pre-flight measured the model of round 3
// against Chrome on 776 (widget, place) couples: 544 wrong, up to 744 px on the
// desktop — it read ONE row height off the first measured widget, and when
// that widget was the band, every row was taken for 180 px. The rects below
// are laid out BY HAND (pinned rows of 273 px, the band's own height, the
// 20 px gutter), never through the model under test.

/** The desktop of the pre-flight: a 1 152 px grid, 273 px cells and rows. */
const DESK = { cell: 273, row: 273, gap: 20 };

/** A Full-width band: a free-height item, its row as tall as its rect. */
const bandItem = (key: string): GridItem => ({ key, ...spanFor('wide', 4), freeHeight: true });
const largeItem = (key: string): GridItem => ({ key, ...spanFor('large', 4) });

/** A rect at `left`, `top` of `cols` cells and `height` px. */
function rectAt(left: number, top: number, cols: number, height: number): ClientRect {
  const width = cols * DESK.cell + (cols - 1) * DESK.gap;
  return { left, top, width, height, right: left + width, bottom: top + height };
}

/** Every item's translation for one (active, over) couple. */
function translations(
  list: GridItem[],
  rects: ClientRect[],
  columns: number,
  activeIndex: number,
  overIndex: number
): Record<string, { x: number; y: number }> {
  const strategy = createDashboardSortingStrategy({ items: list, columns, gap: DESK.gap });
  const out: Record<string, { x: number; y: number }> = {};
  list.forEach((item, index) => {
    const t = strategy({ rects, activeIndex, overIndex, index, activeNodeRect: rects[activeIndex] ?? null });
    out[item.key] = { x: t?.x ?? 0, y: t?.y ?? 0 };
  });
  return out;
}

describe('the dashboard sorting strategy — a Full-width row of its own height (SMA-437, D6)', () => {
  // The band (180 px) on row 0, then eight Larges two by two: rows 1-2, 3-4,
  // 5-6, 7-8, each pair 566 px tall and 586 px apart.
  const expert = [bandItem('band'), ...['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8'].map(largeItem)];
  const expertRects = [
    rectAt(0, 0, 4, 180),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => rectAt((i % 2) * 586, 200 + Math.floor(i / 2) * 586, 2, 566)),
  ];

  it('moves the band to the 8th place by 2 344 px — eight pinned rows of 273 + 20 — not 1 600', () => {
    // After the drop: l1…l7 on rows 0-7, the band on row 8, l8 on rows 9-10.
    const moved = translations(expert, expertRects, 4, 0, 7);
    expect(moved.band).toEqual({ x: 0, y: 2344 });
  });

  it('moves the last Large under the band by its own rows: from 1 958 px to 2 544, and one pair of columns left', () => {
    const moved = translations(expert, expertRects, 4, 0, 7);
    // Row 7 was 200 + 3 × 586 down; row 9 is 8 × 293 + 180 + 20 down.
    expect(moved.l8).toEqual({ x: -586, y: 2544 - 1958 });
    // …and the first Large rises by the band's row alone.
    expect(moved.l1).toEqual({ x: 0, y: -200 });
  });

  it('reads the band’s row on the band’s own rect, and the pinned rows on a pinned one — whatever comes first', () => {
    // Two Larges, then the band (row 2), then two Larges: the band's row
    // starts 586 px down, the rows after it 180 + 20 further.
    const middle = [largeItem('l1'), largeItem('l2'), bandItem('band'), largeItem('l3'), largeItem('l4')];
    const rects = [
      rectAt(0, 0, 2, 566),
      rectAt(586, 0, 2, 566),
      rectAt(0, 586, 4, 180),
      rectAt(0, 786, 2, 566),
      rectAt(586, 786, 2, 566),
    ];
    // The band to the head: band row 0; l1, l2 rows 1-2 (200 px down); l3, l4
    // rows 3-4 (200 + 586 = 786 px down, where they already are).
    const moved = translations(middle, rects, 4, 2, 0);
    expect(moved.band).toEqual({ x: 0, y: -586 });
    expect(moved.l1).toEqual({ x: 0, y: 200 });
    expect(moved.l3).toEqual({ x: 0, y: 0 });
  });

  it.each([4, 2])(
    'without a Full width, translates exactly as the model of round 3 did — the 30 couples of the Gardener preset at %i columns',
    (columns) => {
      // The preset's six visible widgets: Weather M, Gardens L, Tips M,
      // This month M, To-do M, Counters M.
      const sizes = ['medium', 'large', 'medium', 'medium', 'medium', 'medium'] as const;
      const keys = ['weather', 'gardens', 'tips', 'month', 'todo', 'counters'];
      const gardener: GridItem[] = keys.map((key, i) => ({ key, ...spanFor(sizes[i]!, columns) }));
      const placed = packGrid(gardener, columns);
      const rects = gardener.map((item) => {
        const cell = placed.get(item.key)!;
        return rectAt(
          cell.col * (DESK.cell + DESK.gap),
          cell.row * (DESK.row + DESK.gap),
          cell.cols,
          cell.rows * DESK.row + (cell.rows - 1) * DESK.gap
        );
      });

      let couples = 0;
      for (let active = 0; active < gardener.length; active += 1) {
        for (let over = 0; over < gardener.length; over += 1) {
          if (active === over) continue;
          couples += 1;
          const target = packGrid(moveItem(gardener, active, over), columns);
          const moved = translations(gardener, rects, columns, active, over);
          for (const item of gardener) {
            // Round 3's model: one row height for every row.
            const before = translationFor(placed.get(item.key)!, target.get(item.key)!, DESK.cell, DESK.row, DESK.gap);
            expect(moved[item.key], `${item.key}, ${active} → ${over}`).toEqual(before);
          }
        }
      }
      expect(couples).toBe(30);
    }
  );
});
