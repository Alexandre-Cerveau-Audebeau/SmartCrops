import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { presetFor } from '../constants/dashboardPresets';
import type {
  DashboardBlock,
  DashboardLevel,
  DashboardSize,
} from '../types/Dashboard';

vi.mock('../services/gardenApi', () => ({
  fetchGardens: vi.fn(),
  createGarden: vi.fn(),
  updateGarden: vi.fn(),
  deleteGarden: vi.fn(),
}));

vi.mock('../services/dashboardApi', () => ({
  fetchDashboardPreferences: vi.fn(),
  saveDashboardPreferences: vi.fn(),
}));

import GardensDashboard from './GardensDashboard';
import { fetchGardens } from '../services/gardenApi';
import {
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';

/**
 * jsdom lays nothing out: every `getBoundingClientRect` is a zero rect, so
 * dnd-kit's collision detection has no geometry to work with and a keyboard
 * move can never find a neighbour. This gives each widget the rect its grid
 * cell would have — four columns, 280 x 200, 20px gutter — derived from the
 * widget's CURRENT position in the DOM, so the geometry follows a reorder.
 *
 * The same jsdom gap as the shared ResizeObserver stub (SMA-426), scoped to
 * this file because only the drag-and-drop tests need a laid-out page.
 */
function stubGridGeometry(sizes?: Record<string, DashboardSize>) {
  const originalRect = Element.prototype.getBoundingClientRect;
  const originalScroll = Element.prototype.scrollIntoView;
  const WIDTH = 280;
  const HEIGHT = 200;
  const GUTTER = 20;

  // The three footprints of `_spec.md` § 1, in the same 280px column and 20px
  // gutter. Only the tests that need DIFFERENT sizes ask for them (round 2, V4):
  // every other drag test keeps the uniform geometry it was written against.
  const FOOTPRINTS: Record<DashboardSize, { width: number; height: number }> = {
    small: { width: WIDTH, height: HEIGHT },
    medium: { width: WIDTH * 2 + GUTTER, height: HEIGHT },
    large: { width: WIDTH * 2 + GUTTER, height: HEIGHT * 2 + GUTTER },
  };

  const keyOf = (element: Element): string | null =>
    element.getAttribute('data-widget') ??
    element.querySelector('[data-widget]')?.getAttribute('data-widget') ??
    null;

  Element.prototype.scrollIntoView = () => {};
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const key = keyOf(this);
    const order = [...document.querySelectorAll('[data-widget]')].map((node) =>
      node.getAttribute('data-widget')
    );
    const index = key ? order.indexOf(key) : -1;
    if (index < 0) {
      return {
        x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 800,
        width: 1200, height: 800, toJSON: () => ({}),
      } as DOMRect;
    }
    if (sizes) {
      // One row, left to right, each widget as wide and as tall as its size.
      let left = 0;
      for (const previous of order.slice(0, index)) {
        left += FOOTPRINTS[sizes[previous!] ?? 'medium']!.width + GUTTER;
      }
      const { width, height } = FOOTPRINTS[sizes[key!] ?? 'medium']!;
      return {
        x: left, y: 0, top: 0, left,
        right: left + width, bottom: height,
        width, height,
        toJSON: () => ({}),
      } as DOMRect;
    }
    const left = (index % 4) * (WIDTH + GUTTER);
    const top = Math.floor(index / 4) * (HEIGHT + GUTTER);
    return {
      x: left, y: top, top, left,
      right: left + WIDTH, bottom: top + HEIGHT,
      width: WIDTH, height: HEIGHT,
      toJSON: () => ({}),
    } as DOMRect;
  };

  return () => {
    Element.prototype.getBoundingClientRect = originalRect;
    Element.prototype.scrollIntoView = originalScroll;
  };
}

function servePreferences(
  level: DashboardLevel,
  blocks: DashboardBlock[] = presetFor(level)
) {
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level,
    isPreset: true,
    blocks,
    updatedAt: null,
  });
}

/** The widgets in the GRID — the DragOverlay renders a copy of the dragged one. */
const gridWidgets = () =>
  [...document.querySelectorAll('[data-widget]')].filter(
    (node) => !node.closest('[data-drag-overlay]')
  );

const renderedKeys = () =>
  gridWidgets().map((node) => node.getAttribute('data-widget'));

/**
 * The node `useSortable` writes its transform on: the grid cell. The card sits
 * one wrapper below it since round 1 (G6), the wrapper that carries the wobble.
 */
const sortableNode = (key: string) =>
  gridWidgets()
    .find((node) => node.getAttribute('data-widget') === key)!
    .parentElement!.parentElement!;

function renderPage() {
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <GardensDashboard />
      </MemoryRouter>
    </LanguageProvider>
  );
}

/**
 * Renders, waits for the grid and switches the page into Edit mode.
 *
 * The explicit timeout is the SMA-174 rule applied one level down: `findBy*`
 * carries Testing Library's OWN 1 000 ms default, which the package.json
 * `--testTimeout=20000` does not touch. Both waits are for the page to render,
 * and under a full-suite load this file has lost that race — the assertions
 * that follow are unaffected, only the patience of the wait changes.
 */
const RENDER_TIMEOUT = { timeout: 20000 };

async function enterEditMode(
  level: DashboardLevel = 'gardener',
  blocks: DashboardBlock[] = presetFor(level)
) {
  servePreferences(level, blocks);
  renderPage();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit' }, RENDER_TIMEOUT)
  );
  return await screen.findByRole('button', { name: 'Done' }, RENDER_TIMEOUT);
}

/**
 * dnd-kit measures the droppable rects one tick AFTER a drag starts, so an
 * arrow key fired in the same task finds no geometry and moves nothing. Every
 * keyboard step waits for that measurement.
 */
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
};

/**
 * The last layout the debounced save sent. Always the LAST call, never the
 * first: the hook flushes a pending write on unmount, and vitest's stacked
 * hooks run this file's `clearAllMocks` BEFORE Testing Library's cleanup, so
 * the previous test's flush can land at index 0 of this test's calls.
 */
const lastSaved = () => {
  const calls = vi.mocked(saveDashboardPreferences).mock.calls;
  return calls[calls.length - 1]![0];
};
const lastSavedKeys = () => lastSaved().blocks.map((block) => block.key);

beforeEach(() => {
  localStorage.setItem('smartcrops-language', 'en');
  vi.mocked(fetchGardens).mockResolvedValue([]);
  vi.mocked(saveDashboardPreferences).mockClear();
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
});

afterEach(() => vi.clearAllMocks());

describe('GardensDashboard — Edit mode chrome (SMA-336)', () => {
  it('swaps the header actions for Done, and back again', async () => {
    await enterEditMode();

    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Customize' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });

  it('puts the four controls inside every card', async () => {
    await enterEditMode();

    expect(screen.getByRole('button', { name: 'Hide Weather' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Weather' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Weather options' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Change the size of Weather — currently Medium',
      })
    ).toBeInTheDocument();
  });

  it('shows no control at all outside the Edit mode', async () => {
    servePreferences('gardener');
    renderPage();

    await screen.findByRole('button', { name: 'Edit' });
    expect(screen.queryByRole('button', { name: 'Move Weather' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hide Weather' })).toBeNull();
  });

  it('locks the Gardens widget instead of offering to hide it', async () => {
    await enterEditMode();

    expect(screen.queryByRole('button', { name: 'Hide Gardens' })).toBeNull();
    // Round 1 (E6 / G7): role="img" is what makes the aria-label reliably
    // reach assistive technology — a generic div forbids an author name.
    const lock = screen.getByRole('img', { name: "Gardens can’t be hidden" });
    expect(lock).toBeInTheDocument();
    expect(screen.getByLabelText("Gardens can’t be hidden")).toBe(lock);
  });

  it('opens a generic options panel that admits it carries nothing yet', async () => {
    await enterEditMode();

    fireEvent.click(screen.getByRole('button', { name: 'Tips options' }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Widget options')).toBeInTheDocument();
    expect(
      within(menu).getByText('No option for this widget yet.')
    ).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Done' })).toBeInTheDocument();
  });
});

describe('GardensDashboard — resizing and hiding (SMA-336)', () => {
  it('the corner handle cycles Medium to Large and persists the layout', async () => {
    await enterEditMode();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Change the size of Weather — currently Medium',
      })
    );

    expect(
      await screen.findByRole('button', {
        name: 'Change the size of Weather — currently Large',
      })
    ).toBeInTheDocument();
    await waitFor(() => expect(saveDashboardPreferences).toHaveBeenCalled());
    expect(
      lastSaved().blocks.find((block) => block.key === 'weather')!.size
    ).toBe('large');
  });

  it('the cycle wraps Large back to Small so a widget is never stuck', async () => {
    await enterEditMode('expert');

    const handle = () =>
      screen.getByRole('button', { name: /Change the size of Tips/ });
    expect(handle()).toHaveAccessibleName(
      'Change the size of Tips — currently Large'
    );
    fireEvent.click(handle());

    await waitFor(() =>
      expect(handle()).toHaveAccessibleName(
        'Change the size of Tips — currently Small'
      )
    );
  });

  it('« − » removes the widget from the grid and persists it hidden', async () => {
    await enterEditMode();

    fireEvent.click(screen.getByRole('button', { name: 'Hide Tips' }));

    await waitFor(() => expect(renderedKeys()).not.toContain('tips'));
    await waitFor(() => expect(saveDashboardPreferences).toHaveBeenCalled());
    expect(
      lastSaved().blocks.find((block) => block.key === 'tips')!.hidden
    ).toBe(true);
  });
});

describe('GardensDashboard — keyboard reordering (SMA-336)', () => {
  let restoreGeometry: () => void;

  beforeEach(() => {
    restoreGeometry = stubGridGeometry();
  });

  afterEach(() => restoreGeometry());

  it('the drag handle carries dnd-kit’s draggable semantics', async () => {
    await enterEditMode();

    const handle = screen.getByRole('button', { name: 'Move Weather' });
    expect(handle).toHaveAttribute('aria-roledescription', 'sortable');
    expect(handle).toHaveAttribute('tabindex', '0');
    expect(handle).toHaveAttribute('aria-describedby');
  });

  it('announces the keyboard instructions to screen readers', async () => {
    await enterEditMode();

    const handle = screen.getByRole('button', { name: 'Move Weather' });
    const instructions = document.getElementById(
      handle.getAttribute('aria-describedby')!
    );
    expect(instructions).toHaveTextContent(
      'Press Space or Enter to pick up the widget, the arrow keys to move it, Space or Enter to drop it, Escape to cancel.'
    );
  });

  it('moves a widget end to end with the keyboard and saves the new order', async () => {
    await enterEditMode();
    expect(renderedKeys()).toEqual([
      'weather',
      'gardens',
      'tips',
      'month',
      'todo',
      'counters',
    ]);

    const handle = screen.getByRole('button', { name: 'Move Weather' });
    handle.focus();
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' });
    await settle();
    fireEvent.keyDown(handle, { code: 'ArrowRight', key: 'ArrowRight' });
    await settle();
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' });

    await waitFor(() =>
      expect(renderedKeys()).toEqual([
        'gardens',
        'weather',
        'tips',
        'month',
        'todo',
        'counters',
      ])
    );
    await waitFor(() => expect(saveDashboardPreferences).toHaveBeenCalled());
    expect(lastSavedKeys()).toEqual([
      'gardens',
      'weather',
      'tips',
      'month',
      'todo',
      'counters',
      'stats',
      'harvest',
    ]);
  });

  it('never puts the wobble on the node dnd-kit writes its transform to', async () => {
    // Round 1 (G6). Keyframe declarations outrank a normal inline style in the
    // cascade, so animating the SORTABLE node replaced the `transform` dnd-kit
    // writes there and the dragged widget stopped following. The animation now
    // belongs to an inner wrapper; the sortable node keeps the transform.
    await enterEditMode();

    // Mid-drag, so dnd-kit has actually written a transform: Gardens is the
    // neighbour Weather is moving onto, and it shifts out of the way.
    const handle = screen.getByRole('button', { name: 'Move Weather' });
    handle.focus();
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' });
    await settle();
    fireEvent.keyDown(handle, { code: 'ArrowRight', key: 'ArrowRight' });
    await settle();

    const sortable = sortableNode('gardens');
    const inner = sortable.firstElementChild as HTMLElement;

    expect(sortable.getAttribute('style')).toContain('transform');
    expect(getComputedStyle(sortable).animation).toBe('');
    expect(getComputedStyle(inner).animation).toContain('0.5s ease-in-out infinite');

    fireEvent.keyDown(handle, { code: 'Escape', key: 'Escape' });
  });

  it('suppresses the wobble under prefers-reduced-motion', async () => {
    await enterEditMode();

    const inner = sortableNode('weather').firstElementChild as HTMLElement;
    const rules = [...document.querySelectorAll('style')]
      .map((tag) => tag.textContent ?? '')
      .filter((text) => text.includes(inner.className.split(' ').pop()!));

    expect(
      rules.some(
        (text) =>
          text.includes('prefers-reduced-motion: reduce') &&
          text.includes('animation:none')
      )
    ).toBe(true);
  });

  it('lifts the dragged widget into a DragOverlay', async () => {
    await enterEditMode();

    const handle = screen.getByRole('button', { name: 'Move Weather' });
    handle.focus();
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' });

    const overlay = await waitFor(() => {
      const node = document.querySelector('[data-drag-overlay]');
      expect(node).not.toBeNull();
      return node!;
    });
    expect(overlay.querySelector('[data-widget="weather"]')).not.toBeNull();

    fireEvent.keyDown(handle, { code: 'Escape', key: 'Escape' });
    await waitFor(() =>
      expect(document.querySelector('[data-drag-overlay]')).toBeNull()
    );
  });

  it('keeps the dragging slot perceivable while the keyboard holds it', async () => {
    // Round 2 (N3): `opacity: 0` on the slot applied to the whole subtree, the
    // focused drag handle included — dnd-kit keeps DOM focus there for the
    // length of a keyboard move, so the focus indicator went invisible with it.
    await enterEditMode();

    const handle = screen.getByRole('button', { name: 'Move Weather' });
    handle.focus();
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' });
    await settle();

    const slot = sortableNode('weather');
    expect(slot.contains(document.activeElement)).toBe(true);
    // The slot is not what disappears...
    expect(getComputedStyle(slot).opacity).not.toBe('0');
    expect(getComputedStyle(slot).outline).toContain('dashed');
    // ...the card inside it is, so the DragOverlay stays the only visible copy.
    expect(
      getComputedStyle(slot.firstElementChild as HTMLElement).opacity
    ).toBe('0');

    fireEvent.keyDown(handle, { code: 'Escape', key: 'Escape' });
  });

  it('Escape cancels the move and leaves the order — and the server — untouched', async () => {
    await enterEditMode();

    const handle = screen.getByRole('button', { name: 'Move Weather' });
    handle.focus();
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' });
    await settle();
    fireEvent.keyDown(handle, { code: 'ArrowRight', key: 'ArrowRight' });
    await settle();
    // The move is live: the widget is at position 2 and Escape must undo it.
    expect(document.body.textContent).toContain(
      'Weather moved to position 2 of 6.'
    );
    fireEvent.keyDown(handle, { code: 'Escape', key: 'Escape' });

    await waitFor(() =>
      expect(renderedKeys()).toEqual([
        'weather',
        'gardens',
        'tips',
        'month',
        'todo',
        'counters',
      ])
    );
    expect(saveDashboardPreferences).not.toHaveBeenCalled();
  });

  it('keeps the hidden widgets in their slots when the visible ones move', async () => {
    // Novice hides To do and Counts BETWEEN the visible widgets and the last
    // two: a reorder must not push them to the end of the layout.
    await enterEditMode('novice');

    const handle = screen.getByRole('button', { name: 'Move Weather' });
    handle.focus();
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' });
    await settle();
    fireEvent.keyDown(handle, { code: 'ArrowRight', key: 'ArrowRight' });
    await settle();
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' });

    await waitFor(() => expect(saveDashboardPreferences).toHaveBeenCalled());
    expect(lastSavedKeys()).toEqual([
      'gardens',
      'weather',
      'tips',
      'month',
      'todo',
      'counters',
      'stats',
      'harvest',
    ]);
  });
});

// ── Round 2, V4: the neighbours of a dragged widget must MOVE, not deform.
describe('GardensDashboard — drag transforms (SMA-336 round 2, V4)', () => {
  let restoreGeometry: () => void;

  // Footprints that DIFFER, which is the whole point: `rectSortingStrategy`
  // returns `scaleX: newRect.width / oldRect.width` (and the same for the
  // height), so a grid of equal cells hides the bug and this grid does not.
  const sizes = {
    weather: 'small',
    gardens: 'large',
    tips: 'medium',
    month: 'medium',
    todo: 'medium',
    counters: 'medium',
    stats: 'medium',
    harvest: 'medium',
  } as const satisfies Record<string, DashboardSize>;

  const mixedBlocks = () => {
    const blocks = presetFor('gardener');
    for (const block of blocks) block.size = sizes[block.key];
    return blocks;
  };

  beforeEach(() => {
    restoreGeometry = stubGridGeometry(sizes);
  });

  afterEach(() => restoreGeometry());

  it('translates a neighbour out of the way without scaling it', async () => {
    // Before the fix the applied transform read
    // `translate3d(...) scaleX(0.4827...) scaleY(0.4761...)`: a Large pushed
    // aside by a Small was drawn shrunk to the Small's proportions until the
    // drop. `CSS.Translate.toString` keeps the movement and drops the ratios.
    await enterEditMode('gardener', mixedBlocks());

    const handle = screen.getByRole('button', { name: 'Move Weather' });
    handle.focus();
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' });
    await settle();
    fireEvent.keyDown(handle, { code: 'ArrowRight', key: 'ArrowRight' });
    await settle();

    const neighbour = sortableNode('gardens').getAttribute('style') ?? '';
    expect(neighbour).toContain('transform');
    expect(neighbour).toContain('translate3d');
    expect(neighbour).not.toMatch(/scale/i);

    fireEvent.keyDown(handle, { code: 'Escape', key: 'Escape' });
  });

  it('scales nothing on the widget being dragged either', async () => {
    await enterEditMode('gardener', mixedBlocks());

    const handle = screen.getByRole('button', { name: 'Move Weather' });
    handle.focus();
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' });
    await settle();
    fireEvent.keyDown(handle, { code: 'ArrowRight', key: 'ArrowRight' });
    await settle();

    expect(sortableNode('weather').getAttribute('style') ?? '').not.toMatch(
      /scale/i
    );

    fireEvent.keyDown(handle, { code: 'Escape', key: 'Escape' });
  });
});
