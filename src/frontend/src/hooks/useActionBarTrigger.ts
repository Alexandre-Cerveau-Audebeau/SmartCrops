import { useCallback, useState, useSyncExternalStore } from 'react';

/**
 * Whether the header's repeated buttons have passed the line, and the one
 * observer that answers it. The answer outlives the observer: when a height
 * changes, the observer is re-created — `rootMargin` cannot be changed on a
 * live one — and the bar must not blink out for the frame it takes the new
 * one to report (the phone's bar grows from 54 to 73 px as the page enters
 * Edit mode, from the bar itself, mid-page).
 */
function triggerStore() {
  let shown = false;
  return {
    /** Observes `target` against the line `line` px under the top of the window; hidden, and nothing observed, while not armed. */
    observe(target: Element | null, line: number, armed: boolean, onChange: () => void): () => void {
      if (!armed || !target || typeof IntersectionObserver === 'undefined') {
        shown = false;
        return () => {};
      }
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (!entry) return;
          // ABOVE the line, not merely out of it: an element out of view below
          // the screen does not intersect either, and has not been scrolled past.
          const next =
            !entry.isIntersecting &&
            entry.rootBounds !== null &&
            entry.boundingClientRect.bottom <= entry.rootBounds.top;
          if (next === shown) return;
          shown = next;
          onChange();
        },
        { root: null, rootMargin: `-${line}px 0px 0px 0px`, threshold: 0 }
      );
      observer.observe(target);
      return () => observer.disconnect();
    },
    shown: () => shown,
  };
}

/**
 * SMA-437, lot V39, PR B, step B2 — the relay AT THE SAME PLACE (A-10.1): the
 * compact bar shows when the buttons it repeats — `target`, their wrapper in
 * the header, whose bottom is the bottom of both — pass the line « bottom of
 * the site navbar + height of the compact bar », so it lands where they were;
 * it leaves when they come back under it. An `IntersectionObserver` on the
 * window with a NEGATIVE top margin of that height, threshold 0 — no scroll
 * listener. Measured by the lot's pre-flight on the real page: the switch
 * falls at the computed scroll position, to the 2 px step of the measure, at
 * 360, 390, 768 and 1 280 px and in landscape at 568 × 320.
 *
 * `armed` false — the layout loading or failed, the Novice formula (A-9) —
 * observes nothing and answers `false`, and so does a browser without the
 * observer (jsdom): no bar, never a guess.
 */
export function useActionBarTrigger(
  target: Element | null,
  navHeight: number,
  barHeight: number,
  armed: boolean
): boolean {
  const [store] = useState(triggerStore);
  const line = Math.round(navHeight + barHeight);
  const subscribe = useCallback(
    (onChange: () => void) => store.observe(target, line, armed, onChange),
    [store, target, line, armed]
  );
  const getSnapshot = useCallback(() => armed && store.shown(), [store, armed]);
  return useSyncExternalStore(subscribe, getSnapshot, serverShown);
}

/** Nothing scrolls on a server: no bar. */
const serverShown = () => false;
