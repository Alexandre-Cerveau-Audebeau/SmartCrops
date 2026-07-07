import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
// Value import with no runtime cycle: facetVocabularies' reverse imports are
// type-only and erased at compile time.
import { BOOLEAN_FACETS, RANGE_FACETS } from '../constants/facetVocabularies';
import type {
  BooleanFacetConfig,
  RangeFacetConfig,
} from '../constants/facetVocabularies';
import { findPlants } from '../services/plantApi';
import type {
  FacetFieldCounts,
  FindPlantsParams,
} from '../services/plantApi';
import type { Plant } from '../types/Plant';

// SMA-255 T4 — the Library runs on the faceted finder endpoint with REAL
// server pagination: 24 items per page, loadMore() fetches the next page and
// APPENDS it. Search (typo-tolerant, localized) and the structured filters
// are server filters on the same single data path — no more full-catalogue
// load, client-side type filtering, or client-side slicing (which SMA-58
// needed when the list endpoint returned everything at once). SMA-9 T1 moved
// this orchestration wholesale out of PlantLibrary so the facet rail (T2+)
// composes onto a hook, not a page; SMA-9 T2 generalized the single type
// filter into the multi-facet `filters` object.

// Exported so the test suites' finder mocks derive their page math from the
// same constant — a page-size change can't silently drift the tests.
export const PER_PAGE = 24;

// The finder waits for a 2nd character before searching (single letters are
// too broad to be a useful query); 0–1 chars behave as match-all.
export const MIN_QUERY_LENGTH = 2;

/**
 * Multi-select facet state (SMA-9 T2). String values are the exact backend
 * enum member names (PascalCase) — the same strings facetCounts returns.
 * Within one facet the backend ORs the values; facets combine with AND.
 *
 * The T3 booleans carry UI semantics (checked = true, unchecked = not
 * filtered — false is never sent). Two are INVERTED on the wire: the index
 * stores toxicity, the checkbox promises safety, so petSafe/humanSafe
 * translate to isToxicToPets=false / isToxicToHumans=false in the fetch
 * params below. The backend ORs the 'unknown' bucket into every boolean
 * selection ("absence never excludes", SMA-9 foundation).
 */
export interface PlantFinderFilters {
  plantTypeIds: number[];
  careLevels: string[];
  wateringNeedLevels: string[];
  lifeCycles: string[];
  growthRates: string[];
  indoor: boolean;
  droughtTolerant: boolean;
  edible: boolean;
  petSafe: boolean;
  humanSafe: boolean;
  medicinal: boolean;
  saltTolerant: boolean;
  thorny: boolean;
  tropical: boolean;
  invasive: boolean;
  // T4 range sliders — null = inactive (full track); see RangeBounds.
  heightCm: RangeBounds | null;
  hardinessZone: RangeBounds | null;
  wateringPh: RangeBounds | null;
  spacingCm: RangeBounds | null;
  wateringTempC: RangeBounds | null;
}

/**
 * One active numeric range (SMA-9 T4), in the facet's FILTER unit (cm, USDA
 * zone, pH, °C — spacing is UI cm here; the facet's toWire converts to the
 * wire's inches). Either bound may be absent: a missing max is a thumb on the
 * open-ended top ("3 m +" sends no heightCmMax at all), a missing min a thumb
 * resting on the track floor. The fully-rested slider is `null` on the filter
 * itself, never `{}` — null is the single "inactive" representation, so
 * activeFilterCount and the chips row can gate on it directly.
 */
export interface RangeBounds {
  min?: number;
  max?: number;
}

/** The boolean (checkbox) subset of PlantFinderFilters, derived so a new
 * flag can't be added without the toggle surfaces seeing it. */
export type BooleanFilterKey = {
  [K in keyof PlantFinderFilters]: PlantFinderFilters[K] extends boolean
    ? K
    : never;
}[keyof PlantFinderFilters];

/** The range (slider) subset, derived like BooleanFilterKey so a new slider
 * can't be added without the range surfaces seeing it. */
export type RangeFilterKey = {
  [K in keyof PlantFinderFilters]: PlantFinderFilters[K] extends
    | RangeBounds
    | null
    ? K
    : never;
}[keyof PlantFinderFilters];

/** The multi-select (array) subset — what the atomic toggle-values handler
 * and the enum facet configs may point at. */
export type ArrayFilterKey = Exclude<
  keyof PlantFinderFilters,
  BooleanFilterKey | RangeFilterKey
>;

// Single source of truth for the checkboxes and sliders: everything the hook
// does with them (filtersKey serialization, counting, wire params) iterates
// BOOLEAN_FACETS / RANGE_FACETS, so a future checkbox or slider registers in
// ONE place. The configs' declaration order is the serialization order — it
// must stay stable, the filtersKey format is compared across renders.
const BOOLEAN_FILTER_KEYS = BOOLEAN_FACETS.map((facet) => facet.filterKey);
const RANGE_FILTER_KEYS = RANGE_FACETS.map((facet) => facet.filterKey);

/** All-empty filters — the caller's initial state and the Reset target. */
export const EMPTY_FILTERS: PlantFinderFilters = {
  plantTypeIds: [],
  careLevels: [],
  wateringNeedLevels: [],
  lifeCycles: [],
  growthRates: [],
  indoor: false,
  droughtTolerant: false,
  edible: false,
  petSafe: false,
  humanSafe: false,
  medicinal: false,
  saltTolerant: false,
  thorny: false,
  tropical: false,
  invasive: false,
  heightCm: null,
  hardinessZone: null,
  wateringPh: null,
  spacingCm: null,
  wateringTempC: null,
};

// Context-change detection compares this STABLE serialization (fixed field
// order, joined values) rather than object identity: callers may recreate an
// equal filters object on any render without triggering a refetch. Value
// order WITHIN a facet is part of the key — toggle handlers only append or
// remove, so an equal-but-reordered array (which would refetch spuriously
// but harmlessly) does not occur in practice.
function serializeFilters(filters: PlantFinderFilters): string {
  return [
    filters.plantTypeIds.join(','),
    filters.careLevels.join(','),
    filters.wateringNeedLevels.join(','),
    filters.lifeCycles.join(','),
    filters.growthRates.join(','),
    // Boolean flags as a fixed-order bitstring — same stable-key contract as
    // the arrays above (order = BOOLEAN_FACETS declaration order).
    BOOLEAN_FILTER_KEYS.map((key) => (filters[key] ? '1' : '0')).join(''),
    // Ranges as fixed-order `min~max` segments ('' = inactive, absent bounds
    // stay empty-sided) — order = RANGE_FACETS declaration order.
    RANGE_FILTER_KEYS.map((key) => {
      const range = filters[key];
      return range ? `${range.min ?? ''}~${range.max ?? ''}` : '';
    }).join(','),
  ].join('|');
}

const EMPTY_FILTERS_KEY = serializeFilters(EMPTY_FILTERS);

export interface UsePlantFinderInputs {
  /** Raw search text — the hook derives the effective (match-all) query. */
  query: string;
  filters: PlantFinderFilters;
  language: string;
}

export interface UsePlantFinderResult {
  items: Plant[];
  found: number;
  /**
   * `found` of the last UNFILTERED context — the whole-catalogue size behind
   * "N of M" counters. The mount fetch is always unfiltered by design, so it
   * is set from page one and only refreshed by later unfiltered fetches.
   */
  catalogTotal: number;
  facetCounts: FacetFieldCounts[];
  /**
   * Baseline distribution of the whole catalogue — facetCounts of the last
   * UNFILTERED fetch (twin of catalogTotal, populated from the mount fetch).
   * Chip ghost widths derive from it; counts only ever shrink under filters,
   * so this is each value's natural maximum.
   */
  catalogFacetCounts: FacetFieldCounts[];
  /**
   * True during the initial catalogue load ONLY — later fetches (debounced
   * search, facet/language change, page append) update the list in place, so
   * consumers gating their whole UI on this flag don't flash it on every
   * keystroke. T2 may add discreet per-control pending states if the design
   * calls for it.
   */
  initialLoading: boolean;
  error: string | null;
  hasMore: boolean;
  /**
   * True when the displayed set is narrowed at all: an effective text query
   * or any facet selection. Single-sourced here so the empty-state gating
   * can't drift from the fetch's own match-all rule.
   */
  isFiltered: boolean;
  /** Total selected facet values across all facets — drives "Filters · N". */
  activeFilterCount: number;
  loadMore: () => void;
  resetToFirstPage: () => void;
  /**
   * Re-runs the CURRENT context (query + filters + language) from page 1,
   * replacing the list. Contract: usable after ANY failed fetch — the
   * initial one included (SMA-271's Retry) — and always refetches, even
   * when the last fetch succeeded.
   */
  refetch: () => void;
}

export function usePlantFinder({
  query,
  filters,
  language,
}: UsePlantFinderInputs): UsePlantFinderResult {
  const { t } = useTranslation();
  const [items, setItems] = useState<Plant[]>([]);
  const [found, setFound] = useState(0);
  const [catalogTotal, setCatalogTotal] = useState(0);
  // Facet value counts from the last response (T2 renders them as chip
  // counts). Counts are scoped to the current filter context, not the page,
  // so every page of one context carries the same values.
  const [facetCounts, setFacetCounts] = useState<FacetFieldCounts[]>([]);
  const [catalogFacetCounts, setCatalogFacetCounts] = useState<
    FacetFieldCounts[]
  >([]);
  // Single transition true→false by design (see UsePlantFinderResult doc):
  // re-arming it per fetch would flash consumers' gates on every keystroke.
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // refetch()'s force lever (SMA-271): the epoch participates in the
  // context-change comparison below, so bumping it makes the effect treat
  // the CURRENT query/filters as a fresh context (replace from page 1).
  // State — not a prevRef mutation from the handler — so the mechanism
  // rides the effect's existing StrictMode discipline: the double-invoked
  // run is aborted, never commits, and the second run fetches exactly once.
  const [fetchEpoch, setFetchEpoch] = useState(0);
  // Snapshot of the last fetch context so the effect can tell WHAT changed:
  // a filter (q/facets → replace from page 1), the language (refetch the
  // currently loaded pages), the page number (append the next page), or a
  // forced refetch (epoch).
  const prevRef = useRef<{
    q: string;
    filtersKey: string;
    lang: string;
    page: number;
    epoch: number;
  } | null>(null);
  // In-flight guard: the caller's scroll sentinel can fire repeatedly while a
  // page is still loading; page bumps are ignored until the current fetch
  // settles.
  const fetchingRef = useRef(false);

  // 0–1 chars = match-all; the debounce below only applies to real queries.
  const effectiveQuery = query.length >= MIN_QUERY_LENGTH ? query : '';

  const filtersKey = serializeFilters(filters);

  // Each checked box counts as 1; grouped enum chips still count their wire
  // values (T2 decision — the count reflects what is SENT, not what is shown).
  // A range slider narrowed AT ALL (either bound off its track end) counts as
  // exactly 1, whatever its bounds — T4 mockup rule.
  const activeFilterCount =
    filters.plantTypeIds.length +
    filters.careLevels.length +
    filters.wateringNeedLevels.length +
    filters.lifeCycles.length +
    filters.growthRates.length +
    BOOLEAN_FILTER_KEYS.filter((key) => filters[key]).length +
    RANGE_FILTER_KEYS.filter((key) => filters[key] !== null).length;

  const isFiltered = effectiveQuery !== '' || activeFilterCount > 0;

  // Effect event so the fetch effect can read the CURRENT translator without
  // depending on it: `t` swaps identity on every locale change, and a
  // locale-only identity swap must never retrigger fetching (`language` is
  // the real refetch trigger).
  const onFetchError = useEffectEvent((err: unknown) => {
    setError(err instanceof Error ? err.message : t('library.error'));
  });

  // Single consolidated finder fetch — every state (initial, search, facet
  // toggle, language, next page) goes through findPlants. Every state write
  // lives inside the async `run` (never synchronously at the top of the
  // effect) to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    const controller = new AbortController();
    const prev = prevRef.current;
    const contextChanged =
      prev === null ||
      prev.q !== effectiveQuery ||
      prev.filtersKey !== filtersKey ||
      // A bumped epoch forces the replace branch for an OTHERWISE-identical
      // context — that IS refetch()'s contract.
      prev.epoch !== fetchEpoch;
    const queryChanged = prev !== null && prev.q !== effectiveQuery;
    const langChanged = prev !== null && prev.lang !== language;
    const pageAdvanced =
      prev !== null && !contextChanged && !langChanged && page > prev.page;

    // Nothing effective changed (e.g. a re-render with an identical context):
    // keep the current list.
    if (!contextChanged && !langChanged && !pageAdvanced) return;

    // An unfiltered context's `found` IS the catalogue size — recorded so
    // filtered contexts can show "N of M" (see catalogTotal doc).
    const contextIsUnfiltered =
      effectiveQuery === '' && filtersKey === EMPTY_FILTERS_KEY;

    // Single commit point for the catalogue baseline (catalogTotal +
    // catalogFacetCounts) — every fetch branch calls this so a future change
    // to the baseline rule can't silently miss one of them.
    const commitUnfilteredBaseline = (
      foundCount: number,
      counts: FacetFieldCounts[]
    ) => {
      if (!contextIsUnfiltered) return;
      setCatalogTotal(foundCount);
      setCatalogFacetCounts(counts);
    };

    // Hero booleans (T3): each wire param derives from the facet config —
    // the param NAME is the indexed facet field and the sent value is its
    // counted bucket, so the two inverted safety traits (the index stores
    // toxicity, the checkbox promises safety) send FALSE while the direct
    // traits send true; the backend ORs the unknown bucket in either way
    // (absence never excludes). Unchecked boxes stay off the wire. The Pick
    // type pins every facetField to a real FindPlantsParams key.
    const booleanParams: Pick<
      FindPlantsParams,
      BooleanFacetConfig['facetField']
    > = {};
    for (const facet of BOOLEAN_FACETS) {
      booleanParams[facet.facetField] = filters[facet.filterKey]
        ? facet.countedValue === 'true'
        : undefined;
    }

    // Range sliders (T4): both wire params derive from the facet config. An
    // inactive range (null) or an absent bound stays off the wire — the
    // open-ended tops ("3 m +", "150 cm +") are exactly a missing max. toWire
    // converts the filter unit to the wire unit where the two differ
    // (spacing: UI centimetres → indexed inches).
    const rangeParams: Pick<
      FindPlantsParams,
      RangeFacetConfig['minParam'] | RangeFacetConfig['maxParam']
    > = {};
    for (const facet of RANGE_FACETS) {
      const range = filters[facet.filterKey];
      const toWire = facet.toWire ?? ((value: number) => value);
      rangeParams[facet.minParam] =
        range?.min === undefined ? undefined : toWire(range.min);
      rangeParams[facet.maxParam] =
        range?.max === undefined ? undefined : toWire(range.max);
    }

    const baseParams = {
      q: effectiveQuery || undefined,
      lang: language,
      perPage: PER_PAGE,
      plantTypeIds:
        filters.plantTypeIds.length > 0 ? filters.plantTypeIds : undefined,
      careLevels:
        filters.careLevels.length > 0 ? filters.careLevels : undefined,
      wateringNeedLevels:
        filters.wateringNeedLevels.length > 0
          ? filters.wateringNeedLevels
          : undefined,
      lifeCycles:
        filters.lifeCycles.length > 0 ? filters.lifeCycles : undefined,
      growthRates:
        filters.growthRates.length > 0 ? filters.growthRates : undefined,
      ...booleanParams,
      ...rangeParams,
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
          const lastFound = pages[pages.length - 1]?.found ?? 0;
          const lastCounts = pages[pages.length - 1]?.facetCounts ?? [];
          setFound(lastFound);
          setFacetCounts(lastCounts);
          commitUnfilteredBaseline(lastFound, lastCounts);
        } else if (pageAdvanced) {
          const data = await findPlants({ ...baseParams, page }, signal);
          if (signal.aborted) return;
          setItems((current) => [...current, ...data.items]);
          setFound(data.found);
          setFacetCounts(data.facetCounts);
          commitUnfilteredBaseline(data.found, data.facetCounts);
        } else {
          // Context change (or initial load): fetch page 1 and REPLACE.
          const data = await findPlants({ ...baseParams, page: 1 }, signal);
          if (signal.aborted) return;
          setItems(data.items);
          setFound(data.found);
          setFacetCounts(data.facetCounts);
          commitUnfilteredBaseline(data.found, data.facetCounts);
          // Only page 1 was fetched — a caller that changed context without
          // resetting the page would otherwise desync loadMore/prevRef
          // bookkeeping and skip pages. (Handlers still OWN the reset; this
          // only realigns the hook's internal state with what it fetched.)
          if (page !== 1) setPage(1);
        }
        // Commit the fetched context only AFTER a successful, non-aborted
        // fetch: an aborted run (StrictMode double-invoke, rapid typing,
        // unmount) must leave the snapshot untouched so the next effect run
        // still sees the change and refetches. The committed page is the page
        // actually FETCHED: a replace serves page 1 whatever the page state
        // said (see the realignment above).
        const committedPage =
          pageAdvanced || (langChanged && !contextChanged) ? page : 1;
        prevRef.current = {
          q: effectiveQuery,
          filtersKey,
          lang: language,
          page: committedPage,
          epoch: fetchEpoch,
        };
        setError(null);
      } catch (err) {
        if (!signal.aborted && (err as Error).name !== 'AbortError') {
          onFetchError(err);
          // A failed APPEND left page bumped but prevRef uncommitted; roll
          // back so the next loadMore() re-advances and retries this page
          // (the T1 advance cap would otherwise wedge: same-value setPage
          // bails out and the effect never re-runs).
          if (pageAdvanced && prev !== null) setPage(prev.page);
        }
      } finally {
        fetchingRef.current = false;
        if (!signal.aborted) setInitialLoading(false);
      }
    };

    // Debounce only the typed query — facet toggles, language switches and
    // page appends fire immediately.
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
    // `filters` and `filtersKey` are both deps (the effect reads both); an
    // identity-only filters churn re-runs the effect but the filtersKey
    // comparison early-returns it.
  }, [effectiveQuery, fetchEpoch, filters, filtersKey, language, page]);

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

  // Page reset stays OWNED BY THE CALLER'S HANDLERS (search text, facet
  // toggles — the inputs that change the displayed set), never by an effect:
  // the handlers decide WHEN, the hook just executes. NOT called on language
  // change — the language branch above refetches the loaded pages in place,
  // so the visible slice is preserved (SMA-153).
  const resetToFirstPage = useCallback(() => setPage(1), []);

  // Force-refetch the current context from page 1 (see the interface doc and
  // the fetchEpoch declaration for the mechanism). Page first, then epoch:
  // both are plain state updates batched into one render → one effect run.
  const refetch = useCallback(() => {
    setPage(1);
    setFetchEpoch((epoch) => epoch + 1);
  }, []);

  return {
    items,
    found,
    catalogTotal,
    facetCounts,
    catalogFacetCounts,
    initialLoading,
    error,
    hasMore,
    isFiltered,
    activeFilterCount,
    loadMore,
    resetToFirstPage,
    refetch,
  };
}
