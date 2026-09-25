import { useCallback, useLayoutEffect, useState } from 'react';
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
}

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
export function useCompactActionBar(level: DashboardLevel, ready: boolean): CompactActionBarState {
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

  return { enabled, shown, top, repeatedRef: setRepeated, barRef: setBar, refocus };
}
