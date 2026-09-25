import { useMemo, useSyncExternalStore } from 'react';

/**
 * The site's navbar — the one `AppBar` of the product, which `Navbar.tsx`
 * marks with this attribute (SMA-437, lot V39, PR B, step B1).
 */
export const SITE_NAVBAR_SELECTOR = '[data-site-navbar]';

/** A height read off the page, and followed: what `useSyncExternalStore` subscribes to. */
interface HeightStore {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => number;
}

/**
 * The border-box height of the element `locate` finds, cached, and a
 * `ResizeObserver` that keeps the cache equal to it.
 *
 * `locate` runs at SUBSCRIPTION, not at render: the site's navbar belongs to
 * `Layout`, outside the page's tree, and on the first render of the page it
 * is not in the document yet. The height is read once as the subscription
 * starts — React compares the snapshot again right after subscribing, so the
 * page re-renders with it before the first paint it can matter to — and then
 * on every report of the observer. A store rather than a state set from an
 * effect: nothing is copied into React's state, the snapshot IS the measure.
 */
function heightStore(locate: () => Element | null): HeightStore {
  let height = 0;
  return {
    subscribe(onChange) {
      const element = locate();
      if (!element) return () => {};
      const measure = () => {
        const next = element.getBoundingClientRect().height;
        if (next === height) return;
        height = next;
        onChange();
      };
      height = element.getBoundingClientRect().height;
      if (typeof ResizeObserver === 'undefined') return () => {};
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    },
    getSnapshot: () => height,
  };
}

/** Nothing is laid out on a server: no height. */
const serverHeight = () => 0;

/**
 * SMA-437, lot V39, PR B, step B1 — the height of the site's navbar, in px,
 * MEASURED and FOLLOWED (A-10.7): 56 px under 600 px in portrait, 64 px from
 * 600 px, 48 px in landscape under 600 px — MUI's `toolbar` mixin, which the
 * theme does not override. Never recopied: a literal reservation drifts
 * silently (`GardenPlanner.tsx`, the unsaved-changes bar), and the compact
 * action bar sits right under this one, in every orientation. 0 when the page
 * is drawn without the site's navbar — a test, a harness scene.
 */
export function useSiteNavbarHeight(): number {
  const store = useMemo(() => heightStore(() => document.querySelector(SITE_NAVBAR_SELECTOR)), []);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, serverHeight);
}

/**
 * The same measure for an element of the page's own tree — the compact action
 * bar, 54 px, or 73 on a phone in Edit mode (A-10.4) — handed over by a
 * callback ref. 0 while there is none.
 */
export function useElementHeight(element: Element | null): number {
  const store = useMemo(() => heightStore(() => element), [element]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, serverHeight);
}
