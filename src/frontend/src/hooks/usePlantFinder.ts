import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { findPlants } from '../services/plantApi';
import type { FacetFieldCounts } from '../services/plantApi';
import type { Plant } from '../types/Plant';

// SMA-255 T4 — the Library runs on the faceted finder endpoint with REAL
// server pagination: 24 items per page, loadMore() fetches the next page and
// APPENDS it. Search (typo-tolerant, localized) and the type filter are
// server filters on the same single data path — no more full-catalogue load,
// client-side type filtering, or client-side slicing (which SMA-58 needed
// when the list endpoint returned everything at once). SMA-9 T1 moved this
// orchestration wholesale out of PlantLibrary so the facet rail (T2+)
// composes onto a hook, not a page.

// Exported so the test suites' finder mocks derive their page math from the
// same constant — a page-size change can't silently drift the tests.
export const PER_PAGE = 24;

// The finder waits for a 2nd character before searching (single letters are
// too broad to be a useful query); 0–1 chars behave as match-all.
export const MIN_QUERY_LENGTH = 2;

export interface UsePlantFinderInputs {
  /** Raw search text — the hook derives the effective (match-all) query. */
  query: string;
  activeType: number | null;
  language: string;
}

export interface UsePlantFinderResult {
  items: Plant[];
  found: number;
  facetCounts: FacetFieldCounts[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  resetToFirstPage: () => void;
}

export function usePlantFinder({
  query,
  activeType,
  language,
}: UsePlantFinderInputs): UsePlantFinderResult {
  const { t } = useTranslation();
  const [items, setItems] = useState<Plant[]>([]);
  const [found, setFound] = useState(0);
  // Facet value counts from the last response (additive in SMA-9 T1 — no
  // consumer yet; the T2 facet rail reads these). Counts are scoped to the
  // current filter context, not the page, so every page of one context
  // carries the same values.
  const [facetCounts, setFacetCounts] = useState<FacetFieldCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // Snapshot of the last fetch context so the effect can tell WHAT changed:
  // a filter (q/type → replace from page 1), the language (refetch the
  // currently loaded pages), or the page number (append the next page).
  const prevRef = useRef<{
    q: string;
    type: number | null;
    lang: string;
    page: number;
  } | null>(null);
  // In-flight guard: the caller's scroll sentinel can fire repeatedly while a
  // page is still loading; page bumps are ignored until the current fetch
  // settles.
  const fetchingRef = useRef(false);

  // 0–1 chars = match-all; the debounce below only applies to real queries.
  const effectiveQuery = query.length >= MIN_QUERY_LENGTH ? query : '';

  // Effect event so the fetch effect can read the CURRENT translator without
  // depending on it: `t` swaps identity on every locale change, and a
  // locale-only identity swap must never retrigger fetching (`language` is
  // the real refetch trigger).
  const onFetchError = useEffectEvent((err: unknown) => {
    setError(err instanceof Error ? err.message : t('library.error'));
  });

  // Single consolidated finder fetch — every state (initial, search, type
  // filter, language, next page) goes through findPlants. Every state write
  // lives inside the async `run` (never synchronously at the top of the
  // effect) to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    const controller = new AbortController();
    const prev = prevRef.current;
    const contextChanged =
      prev === null ||
      prev.q !== effectiveQuery ||
      prev.type !== activeType;
    const queryChanged = prev !== null && prev.q !== effectiveQuery;
    const langChanged = prev !== null && prev.lang !== language;
    const pageAdvanced =
      prev !== null && !contextChanged && !langChanged && page > prev.page;

    // Nothing effective changed (e.g. a re-render with an identical context):
    // keep the current list.
    if (!contextChanged && !langChanged && !pageAdvanced) return;

    const baseParams = {
      q: effectiveQuery || undefined,
      lang: language,
      perPage: PER_PAGE,
      plantTypeIds: activeType === null ? undefined : [activeType],
    };

    const run = async (signal: AbortSignal) => {
      fetchingRef.current = true;
      try {
        if (langChanged && !contextChanged) {
          // SMA-153 evolution, server-paginated: refetch the CURRENTLY loaded
          // pages (1..page) in the new language and replace positionally. For
          // match-all the natural order is identical, so the visible slice is
          // preserved — no collapse, no scroll jump (SMA-153 intact). For a
          // text search the query legitimately RE-EXECUTES in the new
          // language (localized query_by), so the result set may change —
          // that is the intended product behavior.
          const pages = await Promise.all(
            Array.from({ length: page }, (_, i) =>
              findPlants({ ...baseParams, page: i + 1 }, signal)
            )
          );
          if (signal.aborted) return;
          setItems(pages.flatMap((p) => p.items));
          setFound(pages[pages.length - 1]?.found ?? 0);
          setFacetCounts(pages[pages.length - 1]?.facetCounts ?? []);
        } else if (pageAdvanced) {
          const data = await findPlants({ ...baseParams, page }, signal);
          if (signal.aborted) return;
          setItems((current) => [...current, ...data.items]);
          setFound(data.found);
          setFacetCounts(data.facetCounts);
        } else {
          // Context change (or initial load): fetch page 1 and REPLACE.
          const data = await findPlants({ ...baseParams, page: 1 }, signal);
          if (signal.aborted) return;
          setItems(data.items);
          setFound(data.found);
          setFacetCounts(data.facetCounts);
        }
        // Commit the fetched context only AFTER a successful, non-aborted
        // fetch: an aborted run (StrictMode double-invoke, rapid typing,
        // unmount) must leave the snapshot untouched so the next effect run
        // still sees the change and refetches.
        prevRef.current = {
          q: effectiveQuery,
          type: activeType,
          lang: language,
          page,
        };
        setError(null);
      } catch (err) {
        if (!signal.aborted && (err as Error).name !== 'AbortError') {
          onFetchError(err);
        }
      } finally {
        fetchingRef.current = false;
        if (!signal.aborted) setLoading(false);
      }
    };

    // Debounce only the typed query — type-filter changes, language switches
    // and page appends fire immediately.
    if (contextChanged && queryChanged && effectiveQuery !== '') {
      const timeout = setTimeout(() => run(controller.signal), 300);
      return () => {
        clearTimeout(timeout);
        controller.abort();
      };
    }
    run(controller.signal);
    return () => controller.abort();
    // Raw query is deliberately NOT a dep: a 0↔1-char keystroke leaves
    // effectiveQuery unchanged and requires no work at all. `t` is deliberately
    // NOT a dep either — it's only read inside onFetchError (an effect event),
    // so a locale-only translator identity swap can't retrigger fetching.
  }, [effectiveQuery, activeType, language, page]);

  const hasMore = items.length > 0 && items.length < found;

  // Shared by the caller's scroll sentinel and Load more button. Advances at
  // most ONE page beyond the last fetched context — a double fire (sentinel +
  // button, or two rapid clicks) before the effect runs must not skip a page —
  // and no-ops while a page is in flight.
  const loadMore = useCallback(() => {
    if (fetchingRef.current || !hasMore) return;
    setPage((p) =>
      prevRef.current !== null && p > prevRef.current.page ? p : p + 1
    );
  }, [hasMore]);

  // Page reset stays OWNED BY THE CALLER'S HANDLERS (search text, type
  // filter — the inputs that change the displayed set), never by an effect:
  // the handlers decide WHEN, the hook just executes. NOT called on language
  // change — the language branch above refetches the loaded pages in place,
  // so the visible slice is preserved (SMA-153).
  const resetToFirstPage = useCallback(() => setPage(1), []);

  return {
    items,
    found,
    facetCounts,
    loading,
    error,
    hasMore,
    loadMore,
    resetToFirstPage,
  };
}
