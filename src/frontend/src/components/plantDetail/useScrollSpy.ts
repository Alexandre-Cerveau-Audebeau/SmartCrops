import { useEffect, useState } from 'react';

/**
 * Scroll-spy for the Plant Detail v2 table of contents (SMA-169). Observes the
 * on-page section elements (`document.getElementById(id)`) and returns the id of
 * the section currently nearest the top of the viewport. Returns the first id
 * until the user scrolls.
 *
 * Guarded for environments without IntersectionObserver (jsdom) — there it
 * simply reports the first section, which keeps the TOC rendering testable.
 */
export function useScrollSpy(ids: string[]): string {
  const [activeId, setActiveId] = useState(ids[0] ?? '');
  // The id list is rebuilt on every render; key the effect on its contents
  // rather than the array identity so it only re-subscribes when ids change.
  // JSON.stringify (vs join('|')) avoids collisions if an id ever contains '|'.
  const key = JSON.stringify(ids);

  useEffect(() => {
    // Re-seed the fallback active id whenever `ids` changes, so a stale id never
    // lingers — covers the case where IntersectionObserver is unavailable
    // (jsdom / SSR) and the effect early-returns below.
    setActiveId(ids[0] ?? '');
    if (typeof IntersectionObserver === 'undefined') return;
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Among the sections intersecting the spy band, pick the one highest on
        // the page (smallest top) so the active item tracks the section the
        // reader has reached.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      // Band sits just under the fixed navbar and ignores the bottom 65% of the
      // viewport, so the active section is the one entering the upper area.
      { rootMargin: '-80px 0px -65% 0px', threshold: 0 }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return activeId;
}
