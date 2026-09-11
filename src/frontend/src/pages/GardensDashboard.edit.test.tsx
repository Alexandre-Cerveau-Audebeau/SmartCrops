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
import { rulesFor } from '../test/dashboardDom';
import { packGrid, spanFor } from '../utils/dashboardLayoutGrid';
import { DASHBOARD_SPACING } from '../theme/dashboardTokens';
import type {
  DashboardBlock,
  DashboardLevel,
  DashboardSize,
} from '../types/Dashboard';

vi.mock('../services/gardenApi', () => ({
  createGarden: vi.fn(),
  updateGarden: vi.fn(),
  deleteGarden: vi.fn(),
}));

vi.mock('../services/dashboardApi', () => ({
  fetchDashboardPreferences: vi.fn(),
  saveDashboardPreferences: vi.fn(),
  fetchDashboardData: vi.fn(),
}));

import type {
  DashboardData,
  DashboardGardenData,
} from '../types/DashboardData';
import GardensDashboard from './GardensDashboard';

import {
  fetchDashboardData,
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';

/** SMA-336 PR 2/5 — an empty aggregate: these tests are about the GRID, not the data. */
const dashboardWith = (gardens: DashboardGardenData[]): DashboardData => ({
  gardens,
  varieties: [],
  totals: {
    gardenCount: gardens.length,
    placementCount: gardens.reduce((sum, g) => sum + g.placementCount, 0),
    varietyCount: gardens.reduce((sum, g) => sum + g.varietyCount, 0),
    catalogPlantCount: 536,
  },
});

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
const CELL = 280;
const ROW = 200;
// Round 4 (E'''5): the production gutter, not a copy of its current value —
// the fixture geometry and the grid must move together.
const GUTTER = DASHBOARD_SPACING.gutter;

function stubGridGeometry(sizes?: Record<string, DashboardSize>) {
  const originalRect = Element.prototype.getBoundingClientRect;
  const originalScroll = Element.prototype.scrollIntoView;

  const keyOf = (element: Element): string | null =>
    element.getAttribute('data-widget') ??
    element.querySelector('[data-widget]')?.getAttribute('data-widget') ??
    null;

  // Memoized on the DOM order. dnd-kit measures rects thousands of times per
  // drag, and packing the grid inside every one of those calls made this file
  // take minutes and time whole tests out.
  let cachedOrder = '';
  let cachedPlacement: ReturnType<typeof packGrid> | null = null;
  const placementFor = (order: (string | null)[]) => {
    const orderKey = order.join('|');
    if (cachedPlacement && cachedOrder === orderKey) return cachedPlacement;
    cachedOrder = orderKey;
    cachedPlacement = packGrid(
      order.map((k) => ({ key: k!, ...spanFor(sizes![k!] ?? 'medium', 4) })),
      4
    );
    return cachedPlacement;
  };

  Element.prototype.scrollIntoView = () => {};
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const key = keyOf(this);
    // Round 4 (N'''1): the GRID widgets only. During a drag, DashboardGrid
    // renders the active block a second time inside `[data-drag-overlay]`,
    // `data-widget` and all; a document-wide query therefore carries that key
    // twice, and since `packGrid` keys its placements by a Map, the overlay's
    // placement replaced the grid slot's. The mixed-size assertions then read
    // a cell the production grid does not have.
    const order = renderedKeys();
    const index = key ? order.indexOf(key) : -1;
    if (index < 0) {
      return {
        x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 800,
        width: 1200, height: 800, toJSON: () => ({}),
      } as DOMRect;
    }
    if (sizes) {
      // Four columns laid out by the SAME sparse packing the production code
      // models (round 3, V6). Saying it plainly: this fixture and the sorting
      // strategy share the placement model, so the render tests below pin that
      // the STRATEGY composes translations which keep the target areas
      // disjoint. Whether the model matches the browser is what the hand-written
      // expectations of `dashboardLayoutGrid.test.ts` pin, independently.
      const cell = placementFor(order).get(key!)!;
      const left = cell.col * (CELL + GUTTER);
      const top = cell.row * (ROW + GUTTER);
      const width = cell.cols * CELL + (cell.cols - 1) * GUTTER;
      const height = cell.rows * ROW + (cell.rows - 1) * GUTTER;
      return {
        x: left, y: top, top, left,
        right: left + width, bottom: top + height,
        width, height,
        toJSON: () => ({}),
      } as DOMRect;
    }
    const left = (index % 4) * (CELL + GUTTER);
    const top = Math.floor(index / 4) * (ROW + GUTTER);
    return {
      x: left, y: top, top, left,
      right: left + CELL, bottom: top + ROW,
      width: CELL, height: ROW,
      toJSON: () => ({}),
    } as DOMRect;
  };

  return () => {
    Element.prototype.getBoundingClientRect = originalRect;
    Element.prototype.scrollIntoView = originalScroll;
  };
}

/**
 * The breakpoint the page believes it is at. `DashboardGrid` reads the column
 * count with `useMediaQuery` (round 3, V6), and jsdom ships no `matchMedia`:
 * without this stub MUI answers `false` to everything, the strategy packs for
 * ONE column while the geometry below lays four out, and the reflow assertions
 * would compare two different grids. Same stub shape as Navbar.test.tsx.
 */
function stubColumns(columns: 1 | 2 | 4) {
  // Installed in `beforeEach` and NEVER removed in `afterEach`. With vitest's
  // default `sequence.hooks = 'stack'` this file's afterEach runs BEFORE
  // Testing Library's auto-cleanup, so a `vi.unstubAllGlobals()` there takes
  // `matchMedia` away while the page is still mounted — and React 19 flushes
  // the pending effects of the unmount after that. Same trap the shared
  // ResizeObserver stub documents in src/test/setup.ts, and it showed up the
  // same way: a later test whose render never completed.
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches:
        (query.includes('1200px') && columns >= 4) ||
        (query.includes('600px') && columns >= 2),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

/** The `translate3d(Xpx, Ypx, 0)` a node carries, or (0, 0). */
function translationOf(node: Element): { x: number; y: number } {
  const style = node.getAttribute('style') ?? '';
  const match = /translate3d\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(style);
  return match
    ? { x: Number(match[1]), y: Number(match[2]) }
    : { x: 0, y: 0 };
}

/** Where a widget's slot actually sits mid-drag: its rect plus its transform. */
function drawnRect(key: string) {
  const slot = sortableNode(key);
  const rect = slot.getBoundingClientRect();
  const { x, y } = translationOf(slot);
  return {
    left: rect.left + x,
    top: rect.top + y,
    right: rect.right + x,
    bottom: rect.bottom + y,
  };
}

function overlaps(
  a: ReturnType<typeof drawnRect>,
  b: ReturnType<typeof drawnRect>
) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
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
 *
 * Deliberately BELOW the 20 000 ms test timeout (round 3): at 20 000 ms a slow
 * render exhausted the test's whole budget and failed as a bare
 * "Test timed out", saying nothing about what never appeared.
 */
const RENDER_TIMEOUT = { timeout: 10000 };

async function enterEditMode(
  level: DashboardLevel = 'gardener',
  blocks: DashboardBlock[] = presetFor(level)
) {
  servePreferences(level, blocks);
  renderPage();
  const edit = await screen.findByRole('button', { name: 'Edit' }, RENDER_TIMEOUT);
  // ENABLED, not merely present. `GardensDashboard` renders Edit
  // `disabled={loading || loadError}`, so clicking it while the preferences are
  // still in flight is a no-op and « Done » never arrives — a race this helper
  // lost under a full-suite load, and lost as a bare timeout rather than as
  // anything that named the cause.
  await waitFor(() => expect(edit).toBeEnabled(), RENDER_TIMEOUT);
  fireEvent.click(edit);
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
  // Four columns for the whole file: `DashboardGrid` reads the column count
  // with `useMediaQuery`, and jsdom answers nothing without this.
  stubColumns(4);
  localStorage.setItem('smartcrops-language', 'en');
  vi.mocked(fetchDashboardData).mockResolvedValue(dashboardWith([]));
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

  it('stands each top control on the artboard’s own 26 px chip (A10-10)', async () => {
    // `A6Modifier.dc.html` — `.hb { position: absolute; top: 6px; width: 26px;
    // height: 26px; border-radius: 50%; background: var(--surface); border:
    // 1px solid var(--card-bd) }` for the « − » and the gear, and `.mv { top:
    // 6px; left: 50%; height: 26px; padding: 0 12px; border-radius: 14px }` for
    // the drag handle. The three were bare glyphs in one flex row spanning the
    // card, floating on the widget's own background.
    //
    // The GEOMETRY is what is asserted: this file renders without the product
    // theme, so `surfaceSubtle` and `borderSubtle` would not resolve here and
    // an assertion on them would be about MUI's defaults (round 3, V16).
    await enterEditMode();

    for (const name of ['Hide Weather', 'Weather options']) {
      const rules = rulesFor(screen.getByRole('button', { name }))
        .toLowerCase()
        .replace(/\s+/g, '');
      expect(rules).toContain('position:absolute');
      expect(rules).toContain('top:6px');
      expect(rules).toContain('width:26px');
      expect(rules).toContain('height:26px');
      expect(rules).toContain('border-radius:50%');
      expect(rules).toContain('border:1pxsolid');
    }

    // The drag handle is the one PILL of the three: wider than it is tall, so a
    // pointer can tell the control that is dragged from the two that are
    // clicked. 26 px of height clears the 24 px floor of WCAG 2.2 § 2.5.8, and
    // the three stand 10 px from the edges and half a card apart, so none falls
    // inside another's 24 px circle.
    const handle = rulesFor(screen.getByRole('button', { name: 'Move Weather' }))
      .toLowerCase()
      .replace(/\s+/g, '');
    expect(handle).toContain('top:6px');
    expect(handle).toContain('left:50%');
    expect(handle).toContain('height:26px');
    expect(handle).toContain('border-radius:14px');
    expect(handle).toContain('padding-left:12px');
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

    const panel = await screen.findByRole('dialog', { name: 'Tips Widget options' });
    expect(within(panel).getByText('Widget options')).toBeInTheDocument();
    expect(
      within(panel).getByText('No option for this widget yet.')
    ).toBeInTheDocument();
    // A BUTTON, not a menu item (round 1, G6): the surface is a Popover now.
    expect(within(panel).getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('names the widget on the panel itself, above the generic line (A7)', async () => {
    // `A8Options.dc.html`'s `.pop-h` carries two lines — the widget's name in
    // bold, then « Options du widget ». The panel opened on the generic line
    // alone, so a user who had just clicked one of eight identical gears had
    // nothing ON SCREEN telling them which widget they were standing in.
    await enterEditMode();

    fireEvent.click(screen.getByRole('button', { name: 'Tips options' }));

    const panel = await screen.findByRole('dialog', { name: 'Tips Widget options' });
    const heading = within(panel).getByRole('heading', { level: 3 });
    expect(heading).toHaveTextContent('Tips');
    // The name comes FIRST: it is the heading, the generic line its subtitle.
    expect(
      heading.compareDocumentPosition(within(panel).getByText('Widget options'))
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});

describe('GardensDashboard — the resize grip (round 4, A9)', () => {
  it('is the artboard’s two diagonal strokes, not a two-headed arrow', async () => {
    // `A6Modifier.dc.html`:
    //   <svg class="grip" viewBox="0 0 16 16">
    //     <path d="M15 1 1 15M15 8l-7 7" stroke="currentColor"
    //           stroke-width="2" stroke-linecap="round" fill="none"/>
    //   </svg>
    //
    // It was `OpenInFullOutlined` — a drag affordance on a button that steps
    // through three fixed sizes on a click, and the loudest glyph in Edit mode.
    await enterEditMode();

    const handle = screen.getByRole('button', {
      name: 'Change the size of Weather — currently Medium',
    });
    const path = handle.querySelector('svg[viewBox="0 0 16 16"] path');
    expect(path).not.toBeNull();
    expect(path).toHaveAttribute('d', 'M15 1 1 15M15 8l-7 7');
    expect(path).toHaveAttribute('fill', 'none');
    // The gesture it names has not changed: it still resizes, and it is still
    // a button a keyboard can reach.
    expect(handle.tagName).toBe('BUTTON');
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

  it('the dragged VISUAL is the DragOverlay, and it never deforms', async () => {
    // Round 3 (N'3): the previous version of this test read the source slot,
    // where dnd-kit may legitimately write nothing at all — an empty style has
    // no `scale` in it either, so the assertion could pass on nothing. The
    // dragged visual is the overlay, and that is what has to be checked.
    await enterEditMode('gardener', mixedBlocks());

    const handle = screen.getByRole('button', { name: 'Move Weather' });
    handle.focus();
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' });
    await settle();
    fireEvent.keyDown(handle, { code: 'ArrowRight', key: 'ArrowRight' });
    await settle();

    // dnd-kit positions the overlay on the PARENT of our content node.
    const overlay = document.querySelector('[data-drag-overlay]')!
      .parentElement as HTMLElement;
    const style = overlay.getAttribute('style') ?? '';

    expect(overlay.querySelector('[data-widget="weather"]')).not.toBeNull();
    expect(style).toContain('position: fixed');
    // It moved: the keyboard step is a real translation, not the identity.
    expect(translationOf(overlay)).not.toEqual({ x: 0, y: 0 });
    // And it is drawn at its own size. `@dnd-kit/core` writes the overlay
    // transform itself with `CSS.Transform.toString`, so the string carries
    // `scaleX(1) scaleY(1)` rather than no scale at all — what must never
    // happen is a factor OTHER than 1.
    // Round 4 (E'''4): collected, THEN asserted. `matchAll` on a style with no
    // scale token yields nothing, so the loop this replaces passed without
    // ever testing the contract it names.
    const factors = [...style.matchAll(/scale[XY]\(([-\d.]+)\)/g)].map(
      ([, factor]) => Number(factor)
    );
    expect(factors).toEqual([1, 1]);

    fireEvent.keyDown(handle, { code: 'Escape', key: 'Escape' });
  });

  it('no widget is drawn on top of the drop preview', async () => {
    // Round 3 (V6), the point of the whole exercise: the dashed frame is the
    // active widget's own slot, translated to the cell the drop will give it.
    // Since the target layout is packed, that area is free — so no other
    // widget, wherever the reflow puts it, may be drawn over it.
    await enterEditMode('gardener', mixedBlocks());

    const handle = screen.getByRole('button', { name: 'Move Weather' });
    handle.focus();
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' });
    await settle();
    fireEvent.keyDown(handle, { code: 'ArrowRight', key: 'ArrowRight' });
    await settle();

    const preview = drawnRect('weather');
    const others = renderedKeys().filter((key) => key !== 'weather');
    expect(others.length).toBeGreaterThan(0);
    for (const key of others) {
      expect({ key, overlapping: overlaps(drawnRect(key!), preview) }).toEqual({
        key,
        overlapping: false,
      });
    }

    fireEvent.keyDown(handle, { code: 'Escape', key: 'Escape' });
  });

  it('and no widget carries a scale factor while it reflows', async () => {
    await enterEditMode('gardener', mixedBlocks());

    const handle = screen.getByRole('button', { name: 'Move Weather' });
    handle.focus();
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' });
    await settle();
    fireEvent.keyDown(handle, { code: 'ArrowRight', key: 'ArrowRight' });
    await settle();

    for (const key of renderedKeys()) {
      expect({
        key,
        style: sortableNode(key!).getAttribute('style') ?? '',
      }).toEqual({ key, style: expect.not.stringMatching(/scale/i) });
    }

    fireEvent.keyDown(handle, { code: 'Escape', key: 'Escape' });
  });
});
