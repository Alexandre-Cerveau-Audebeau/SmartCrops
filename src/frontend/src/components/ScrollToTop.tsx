import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * SMA-114: scrolls the window back to the top on every route change. Without
 * this, react-router preserves the previous scroll offset when navigating, so
 * landing on a new page (e.g. a plant detail from mid-Library) starts scrolled
 * down. Keyed on `pathname` only — a query/hash change does not reset scroll.
 * Renders nothing. Operates on `window`, so it never conflicts with the
 * horizontal, ref-scoped `useScrollHold` (SMA-58).
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
