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
    // Reset the active id only when the current one is no longer valid (its
    // section disappeared from `ids`). Keeps the highlighted section stable when
    // `ids` changes but the scrolled section still exists, and avoids a flash on
    // the IntersectionObserver path. Also covers the jsdom / SSR fallback below.
    setActiveId((prev) => (ids.includes(prev) ? prev : (ids[0] ?? '')));
    if (typeof IntersectionObserver === 'undefined') return;
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const intersectingIds = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        // `entries` only includes targets whose intersection state CHANGED, so we
        // accumulate the full set of currently-intersecting ids across callbacks,
        // then highlight the one highest on the page (smallest top). This avoids
        // prematurely deselecting a higher section that is still intersecting when
        // a lower section enters the spy band.
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (entry.isIntersecting) intersectingIds.add(id);
          else intersectingIds.delete(id);
        }
        const next = Array.from(intersectingIds)
          .map((id) => document.getElementById(id))
          .filter((el): el is HTMLElement => el !== null)
          .sort(
            (a, b) =>
              a.getBoundingClientRect().top - b.getBoundingClientRect().top
          )[0];
        if (next) setActiveId(next.id);
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
