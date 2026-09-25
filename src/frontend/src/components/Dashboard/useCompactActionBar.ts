import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { hasActionBar } from '../../constants/dashboardCapabilities';
import { useActionBarTrigger } from '../../hooks/useActionBarTrigger';
import { useElementHeight, useSiteNavbarHeight } from '../../hooks/useSiteNavbarHeight';
import type { DashboardLevel } from '../../types/Dashboard';

export interface CompactActionBarState {
  /** The formula has a compact bar (A-9): the page mounts it. */
  enabled: boolean;
  /** It shows: the header's repeated buttons have passed the line (A-10.1). */
  shown: boolean;
  /** Where it sits: right under the site navbar, whose height is measured (A-10.7). */
  top: number;
  /** The callback ref of the header's repeated buttons — what the trigger observes. */
  repeatedRef: (element: HTMLDivElement | null) => void;
  /** The callback ref of the bar — measured, its height is half of the line. */
  barRef: (element: HTMLDivElement | null) => void;
  /**
   * When `element` is one of the two repeated buttons in the row that is
   * hidden now, focuses its twin in the live row — how the page gives the
   * focus back when a panel opened from a button that went inert meanwhile
   * closes (technical decision 8).
   */
  refocus: (element: Element | null) => void;
  /**
   * Called right BEFORE the page enters or leaves Edit mode: while the bar
   * shows, remembers where the first card visible under the two bars stands,
   * so the page can be scrolled back by what the toggle moved it (B8).
   */
  holdView: () => void;
}

/** A card of the grid, and where its top stood in the window before the toggle. */
interface ViewAnchor {
  card: Element;
  top: number;
}

/** The cards of the grid — not the copy the drag overlay draws of the one being dragged. */
const gridCards = () =>
  [...document.querySelectorAll('[data-widget]')].filter((card) => !card.closest('[data-drag-overlay]'));

/** The space `scroll-padding-top` keeps under the two bars (A-10.6, WCAG 2.4.11 — the focus not obscured). */
const SCROLL_PADDING_GAP = 8;

/**
 * SMA-437, lot V39, PR B, step B4 — the compact action bar's state, as the
 * page reads it: whether the formula has one (B3), where the site navbar ends
 * (B1), how tall the bar is, and whether the header's repeated buttons have
 * passed the line « navbar + bar » (B2). `ready` is false while the layout
 * loads or could not be read: no bar then (A-10.2), the trigger not armed.
 *
 * Step B6 — what the bar owes the keyboard (A-10.6). ONE row of the two
 * buttons is live at a time, the other `inert`: when the button that has the
 * focus is in the row that has just been hidden, the focus goes to its twin —
 * the button of the same action, `data-page-action`, in the row that has just
 * come — without scrolling, and never to the `<body>`, which is where the
 * browser drops the focus of an element that turns inert. In a layout effect,
 * before the paint: the same commit that sets `inert` has already taken it
 * off the twin, and the browser only applies the loss of focus at the next
 * update of the rendering (pre-flight, § C.4). The bar is never GIVEN the
 * focus when it appears: a focus elsewhere stays where it is. And while the
 * bar shows, `scroll-padding-top` on the page's one scrolling element keeps
 * the navbar, the bar and 8 px free, so a control the keyboard reaches is
 * never scrolled under them; the previous value comes back when it leaves.
 */
export function useCompactActionBar(
  level: DashboardLevel,
  ready: boolean,
  editing: boolean
): CompactActionBarState {
  const [repeated, setRepeated] = useState<HTMLDivElement | null>(null);
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  const enabled = hasActionBar(level);
  const top = useSiteNavbarHeight();
  const barHeight = useElementHeight(bar);
  const shown = useActionBarTrigger(repeated, top, barHeight, enabled && ready);

  const refocus = useCallback(
    (element: Element | null) => {
      const hidden = shown ? repeated : bar;
      const live = shown ? bar : repeated;
      if (!element || !hidden || !live || !hidden.contains(element)) return;
      const action = element.getAttribute('data-page-action');
      if (!action) return;
      live.querySelector<HTMLElement>(`[data-page-action="${action}"]`)?.focus({ preventScroll: true });
    },
    [shown, repeated, bar]
  );

  useLayoutEffect(() => {
    refocus(document.activeElement);
  }, [refocus]);

  useLayoutEffect(() => {
    if (!shown) return;
    const root = document.documentElement;
    const previous = root.style.scrollPaddingTop;
    root.style.scrollPaddingTop = `${top + barHeight + SCROLL_PADDING_GAP}px`;
    return () => {
      root.style.scrollPaddingTop = previous;
    };
  }, [shown, top, barHeight]);

  // Step B8 — the content stays still (pre-flight, technical decision 11).
  // At the top of the page one enters Edit mode from the header, and the
  // header is what one looks at; the bar lets one toggle it mid-page, where
  // the cards take their 34 / 38 px of controls and the header loses or
  // gains a line: what one looks at moved 32 px on a phone (11.6 on the
  // desktop), and Chrome's scroll anchoring does not make up for it
  // (measured). So the first card visible under the two bars is remembered
  // before the toggle, and the window scrolled by what it moved, before the
  // paint: a correction of position, not an animation — the same under
  // `prefers-reduced-motion`.
  const anchor = useRef<ViewAnchor | null>(null);
  const line = top + barHeight;
  const holdView = useCallback(() => {
    if (!shown) {
      anchor.current = null;
      return;
    }
    const card = gridCards().find((candidate) => candidate.getBoundingClientRect().bottom > line);
    anchor.current = card ? { card, top: card.getBoundingClientRect().top } : null;
  }, [shown, line]);

  useLayoutEffect(() => {
    const held = anchor.current;
    anchor.current = null;
    if (!held || !held.card.isConnected) return;
    const moved = held.card.getBoundingClientRect().top - held.top;
    if (Math.abs(moved) < 0.5) return;
    window.scrollBy({ top: moved, left: 0, behavior: 'instant' });
  }, [editing]);

  return { enabled, shown, top, repeatedRef: setRepeated, barRef: setBar, refocus, holdView };
}
