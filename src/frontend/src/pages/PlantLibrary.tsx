import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { alpha, useTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import { visuallyHidden } from '@mui/utils';
import SearchIcon from '@mui/icons-material/Search';
import SpaIcon from '@mui/icons-material/Spa';
import TuneIcon from '@mui/icons-material/Tune';
import { useLanguage } from '../hooks/useLanguage';
import {
  EMPTY_FILTERS,
  MIN_QUERY_LENGTH,
  usePlantFinder,
} from '../hooks/usePlantFinder';
import type {
  ArrayFilterKey,
  BooleanFilterKey,
  PlantFinderFilters,
  RangeBounds,
  RangeFilterKey,
} from '../hooks/usePlantFinder';
import { useMeasurementPage } from '../hooks/useMeasurementPage';
import { useUnitSystem } from '../hooks/useUnitSystem';
import { fetchPlantTypes } from '../services/plantApi';
import type { PlantType } from '../types/PlantType';
import FilterPanel from '../components/library/FilterPanel';
import {
  BOOLEAN_FACETS,
  ENUM_FACETS,
  RANGE_FACETS,
  rangeChipLabel,
} from '../constants/facetVocabularies';
import PlantCard from '../components/PlantCard';
// --- SMA-394 easter eggs — delete this block to remove ---
import { getEasterEggCards } from '../easteregg';
// --- end SMA-394 ---

// SMA-255 T4 put the Library on the faceted finder endpoint (real server
// pagination); SMA-9 T1 moved that fetch orchestration wholesale into
// usePlantFinder; SMA-9 T2 added the filter panel (left rail on desktop,
// full-screen drawer on mobile) with the five enum facets — the old
// single-select type-chip row is retired, plant type is now a multi-select
// facet in the panel. SMA-9 T3 added the hero boolean checkboxes, the
// removable active-filter chips row, and the resilient empty/error states
// (SMA-271: the controls survive a fetch error; Retry recovers in place).
// This component is presentation + handlers: it owns the raw inputs (search
// text, facet selections, panel open state), hands them to the hook, and
// renders what comes back.

// Re-exported from its original home so the page size keeps a stable import
// path (the test suite's finder mock derives its page math from it).
export { PER_PAGE } from '../hooks/usePlantFinder';

// Active-filter chips wear the project's soft primary tint (the ForMeBlock
// alpha idiom) — "tinted" per the mockup, distinct from the outlined/filled
// facet pills.
const activeChipSx = {
  bgcolor: (theme: Theme) =>
    alpha(
      theme.palette.primary.main,
      theme.palette.mode === 'dark' ? 0.15 : 0.06
    ),
};

export default function PlantLibrary() {
  const { t } = useTranslation();
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<PlantFinderFilters>(EMPTY_FILTERS);
  // Panel CLOSED by default (design brief) — the rest state shows the full
  // catalogue with no rail.
  const [panelOpen, setPanelOpen] = useState(false);
  const { language } = useLanguage();
  const { system } = useUnitSystem();
  // SMA-352 — the finder's temperature facet renders °C/°F live: this page
  // displays measurements, so the bar unit switch shows here.
  useMeasurementPage();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // --- SMA-394 easter eggs — delete this block to remove ---
  // Matched BEFORE the hook: findPlants writes the query into the request URL,
  // so a key reaching it would be logged in clear text by the proxy and by the
  // search engine. The empty substituted query also leaves the finder context
  // unfiltered, so the counter and the facet counts cannot move.
  const eggCards = getEasterEggCards(searchQuery);
  // --- end SMA-394 ---

  const {
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
  } = usePlantFinder({
    // SMA-394: `eggCards.length ? '' : searchQuery` reverts to `searchQuery`
    query: eggCards.length ? '' : searchQuery,
    filters,
    language,
  });

  // --- SMA-394 easter eggs — delete this block to remove ---
  // The finder ran against an EMPTY query, so everything it reports describes
  // the whole catalogue rather than the single card on screen: `found` would
  // announce 536 to a screen reader, and `hasMore` would arm both Load more and
  // the scroll sentinel, which fetch catalogue pages that can never be shown.
  //
  // Substituting into `let` bindings would have kept every consumer below
  // written exactly as develop has it, but `prefer-const` rejects that on the
  // nine siblings of this destructuring that are never reassigned. So the four
  // substitutes are named instead, and each consumer carries a one-line marker
  // naming the expression it reverts to. REMOVAL = delete the three marked
  // blocks in this file, then follow those seven markers.
  const eggActive = eggCards.length > 0;
  const displayItems = eggActive ? eggCards : items;
  const displayTotal = eggActive ? eggCards.length : found;
  const displayHasMore = hasMore && !eggActive;
  // A typed key IS a filter, so the counter reads the substituted total rather
  // than announcing the whole catalogue above a single card.
  const displayFiltered = eggActive || isFiltered;
  // The query the HOOK will see for a given raw input. A key is substituted to
  // '' before it reaches the finder, so typing or clearing one leaves the
  // hook's effective query untouched — and a page reset there would desync the
  // local page from the hook's committed snapshot, stranding Load more on a
  // page already fetched. `handleSearchChange` compares through this rather
  // than through the raw text.
  const eggQuery = (raw: string) => (getEasterEggCards(raw).length ? '' : raw);
  // --- end SMA-394 ---

  // Single guarded path for mount AND Retry — a slow initial response must
  // never overwrite a fresher Retry commit, and vice versa. Every load
  // claims the next sequence number and only the LATEST claim may commit.
  const typesSeq = useRef(0);
  const loadPlantTypes = useCallback(() => {
    const seq = ++typesSeq.current;
    fetchPlantTypes()
      .then((types) => {
        if (seq === typesSeq.current) setPlantTypes(types);
      })
      .catch((err) => console.error(err));
  }, []);

  // Plant types load once (mount). They're translated client-side via
  // `plantTypes.*`, so there's no need to refetch them on a language change.
  useEffect(() => {
    loadPlantTypes();
    // The sequence bump REPLACES the old AbortController as the cleanup
    // guard: it invalidates the in-flight mount fetch on unmount/StrictMode
    // re-run, so a post-cleanup commit is dropped by the same staleness
    // mechanism that orders mount vs Retry.
    return () => {
      // Not a DOM-ref snapshot (the rule's target): bumping the LATEST
      // sequence value at cleanup time is the point — it invalidates
      // whatever load is in flight right now.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      typesSeq.current++;
    };
  }, [loadPlantTypes]);

  // Auto-load the next PAGE when the sentinel scrolls into view (server
  // pagination since SMA-255 T4 — this is a network fetch, guarded against
  // double-firing while a page is in flight). Guarded for environments
  // without IntersectionObserver (jsdom); there the Load more button +
  // keyboard users keep the list reachable. items.length stays a dep so the
  // observer re-arms after each append — re-observing reports the current
  // intersection, which cascades the next page when the sentinel is still in
  // view (the pre-T4 behavior).
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    // SMA-394: `displayHasMore` reverts to `hasMore` (here and in the dep array)
    if (!displayHasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      // Preload the next page ~100px before the sentinel reaches the viewport
      // so the new cards are there before the user hits the bottom.
      { rootMargin: '100px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [displayHasMore, items.length, loadMore]);

  // Reset to page 1 on the inputs that change the displayed SET — the search
  // text and the facet toggles. NOT language: the hook's language branch
  // refetches the loaded pages in place, so the visible slice is preserved
  // (SMA-153). Resetting in handlers (not an effect) keeps clear of
  // react-hooks/set-state-in-effect.
  const handleSearchChange = (value: string) => {
    // Reset only when the EFFECTIVE query changes (either side of the edit is
    // a real query). A 0↔1-char edit keeps the displayed set identical
    // (match-all on both sides), and resetting page 1 there desyncs the page
    // state from the hook's fetched context — the next Load more became a
    // silent no-op (advance 1→2 = a page already fetched). Pre-existing T4
    // bug surfaced in review; not a refactor drift.
    // SMA-394: `eggQuery(searchQuery)` reverts to `searchQuery`, `eggQuery(value)` to `value`
    const effectiveQueryChanged =
      eggQuery(searchQuery).length >= MIN_QUERY_LENGTH ||
      eggQuery(value).length >= MIN_QUERY_LENGTH;
    setSearchQuery(value);
    if (effectiveQueryChanged) resetToFirstPage();
  };

  // Atomic multi-value toggle: grouped chips (e.g. "Vivace" =
  // Perennial + HerbaceousPerennial) add or remove ALL their wire values
  // together — all-selected means remove all, anything missing means add the
  // missing ones.
  const handleToggleValues = (
    field: ArrayFilterKey,
    wireValues: Array<string | number>
  ) => {
    setFilters((prev) => {
      const current = prev[field] as Array<string | number>;
      const allSelected = wireValues.every((v) => current.includes(v));
      const next = allSelected
        ? current.filter((v) => !wireValues.includes(v))
        : [...current, ...wireValues.filter((v) => !current.includes(v))];
      // Computed-key spread widens the array type — safe: `next` holds the
      // same element type it was read with.
      return { ...prev, [field]: next } as PlantFinderFilters;
    });
    resetToFirstPage();
  };

  // Checkbox flip — one boolean facet on/off (SMA-9 T3).
  const handleToggleBoolean = (field: BooleanFilterKey) => {
    setFilters((prev) => ({ ...prev, [field]: !prev[field] }));
    resetToFirstPage();
  };

  // Slider commit (SMA-9 T4) — the panel maps thumb positions to
  // RangeBounds (null = full track = inactive); a chip delete passes null.
  const handleSetRange = (field: RangeFilterKey, range: RangeBounds | null) => {
    setFilters((prev) => ({ ...prev, [field]: range }));
    resetToFirstPage();
  };

  // "All" quick chip — clears the type selection only (the other facets and
  // the search text are untouched).
  const handleClearTypes = () => {
    setFilters((prev) => ({ ...prev, plantTypeIds: [] }));
    resetToFirstPage();
  };

  // Reset clears every facet selection but NOT the search text (design
  // brief); the panel stays open.
  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
    resetToFirstPage();
  };

  const closePanel = () => setPanelOpen(false);

  // SMA-271 follow-up: the mount-only types fetch can have died with the
  // same outage Retry recovers from — re-attempt it alongside the finder
  // refetch, or the quick row and the Type facet stay empty until a full
  // reload. Gated on emptiness so a healthy list is never refetched; the
  // shared loader's sequence guard orders this against the mount fetch and
  // against rapid repeat clicks alike.
  const handleRetry = () => {
    if (plantTypes.length === 0) {
      loadPlantTypes();
    }
    refetch();
  };

  const filterPanel = (
    <FilterPanel
      open={panelOpen}
      onClose={closePanel}
      plantTypes={plantTypes}
      vocabularies={ENUM_FACETS}
      booleanFacets={BOOLEAN_FACETS}
      rangeFacets={RANGE_FACETS}
      facetCounts={facetCounts}
      catalogFacetCounts={catalogFacetCounts}
      catalogTotal={catalogTotal}
      filters={filters}
      onToggleValues={handleToggleValues}
      onToggleBoolean={handleToggleBoolean}
      onSetRange={handleSetRange}
      onReset={handleReset}
      found={found}
      variant={isDesktop ? 'rail' : 'drawer'}
    />
  );

  return (
    <Container maxWidth="lg" sx={{ pt: 4, pb: 6 }}>
      <Typography variant="h4" fontWeight={700} color="primary" sx={{ mb: 3 }}>
        {t('library.title')}
      </Typography>

      {/* The finder controls render whenever the initial load settled — a
          fetch error INCLUDED (SMA-271): the search field, the quick row and
          the Filters button stay reachable next to the error Alert, so the
          user can retry or change context without a page reload. Only the
          counter line hides under an error (its numbers would be stale). */}
      {!initialLoading && (
        <>
          {/* Search + panel toggle on ONE line (mockup). */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flexWrap: 'wrap',
              mb: 2,
            }}
          >
            <TextField
              placeholder={t('library.searchPlaceholder')}
              fullWidth
              variant="outlined"
              size="small"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              inputProps={{ 'aria-label': t('library.searchPlaceholder') }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{ maxWidth: 500 }}
            />
            <Button
              startIcon={<TuneIcon />}
              variant={
                panelOpen || activeFilterCount > 0 ? 'contained' : 'outlined'
              }
              onClick={() => setPanelOpen((open) => !open)}
              aria-expanded={panelOpen}
              aria-controls="library-filter-panel"
              sx={{ borderRadius: 999, textTransform: 'none', flexShrink: 0 }}
            >
              {t('library.filters.button', { count: activeFilterCount })}
            </Button>
          </Box>

          {/* Quick type chips — a SHORTCUT over the SAME multi-select state
              as the rail's Type facet (filters.plantTypeIds is the single
              source of truth; the two surfaces always mirror each other).
              No counts on this row (mockup). */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            <Chip
              label={t('library.allTypes')}
              color={filters.plantTypeIds.length === 0 ? 'primary' : 'default'}
              variant={
                filters.plantTypeIds.length === 0 ? 'filled' : 'outlined'
              }
              onClick={handleClearTypes}
              aria-pressed={filters.plantTypeIds.length === 0}
            />
            {plantTypes.map((pt) => (
              <Chip
                key={pt.id}
                label={t(`plantTypes.${pt.name}`, pt.name)}
                color={
                  filters.plantTypeIds.includes(pt.id) ? 'primary' : 'default'
                }
                variant={
                  filters.plantTypeIds.includes(pt.id) ? 'filled' : 'outlined'
                }
                onClick={() => handleToggleValues('plantTypeIds', [pt.id])}
                aria-pressed={filters.plantTypeIds.includes(pt.id)}
              />
            ))}
          </Box>

          {/* Active-filter chips (T3, mockup): one removable chip per
              selected value, between the quick row and the counter. Enum and
              type chips read "Section : Valeur"; boolean chips are bare
              labels. A grouped chip (Vivace) is ONE chip whose delete removes
              ALL its wire values. Appears/disappears with content — NO ghost
              sizing here, the motion is deliberate. */}
          {activeFilterCount > 0 && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexWrap: 'wrap',
                mb: 2,
              }}
            >
              {filters.plantTypeIds.map((id) => {
                const pt = plantTypes.find((p) => p.id === id);
                return (
                  <Chip
                    key={`type-${id}`}
                    size="small"
                    label={`${t('library.filters.activeType')} : ${
                      pt ? t(`plantTypes.${pt.name}`, pt.name) : id
                    }`}
                    onDelete={() => handleToggleValues('plantTypeIds', [id])}
                    sx={activeChipSx}
                  />
                );
              })}
              {ENUM_FACETS.flatMap((facet) =>
                facet.chips
                  .filter((chip) =>
                    chip.wireValues.every((v) =>
                      filters[facet.filterKey].includes(v)
                    )
                  )
                  .map((chip) => (
                    <Chip
                      key={`${facet.facetField}-${chip.labelKeySuffix}`}
                      size="small"
                      label={`${t(facet.titleKey)} : ${t(
                        `library.filters.values.${facet.facetField}.${chip.labelKeySuffix}`
                      )}`}
                      onDelete={() =>
                        handleToggleValues(facet.filterKey, chip.wireValues)
                      }
                      sx={activeChipSx}
                    />
                  ))
              )}
              {BOOLEAN_FACETS.filter((b) => filters[b.filterKey]).map((b) => (
                <Chip
                  key={b.filterKey}
                  size="small"
                  label={t(b.labelKey)}
                  onDelete={() => handleToggleBoolean(b.filterKey)}
                  sx={activeChipSx}
                />
              ))}
              {/* Range chips (T4): "Section : plage" through the same
                  shared helper family as the slider's dynamic label; delete
                  resets that range to the full track. */}
              {RANGE_FACETS.filter((f) => filters[f.filterKey] !== null).map(
                (facet) => (
                  <Chip
                    key={facet.filterKey}
                    size="small"
                    label={rangeChipLabel(
                      t,
                      facet,
                      filters[facet.filterKey],
                      language,
                      system
                    )}
                    onDelete={() => handleSetRange(facet.filterKey, null)}
                    sx={activeChipSx}
                  />
                )
              )}
              {/* Same reset as the panel header: facets only, search text
                  preserved. */}
              <Button
                variant="text"
                size="small"
                onClick={handleReset}
                sx={{
                  textTransform: 'none',
                  textDecoration: 'underline',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                {t('library.filters.clearAll')}
              </Button>
            </Box>
          )}

          {/* Rich left-aligned counter line (mockup): the found count in
              bold/primary, the context tail in secondary. */}
          {!error && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              <Box
                component="span"
                sx={{ fontWeight: 700, color: 'primary.main' }}
              >
                {/* SMA-394: `displayFiltered` reverts to `isFiltered`, `displayTotal` to `found` */}
                {t('library.filters.resultCount', {
                  count: displayFiltered ? displayTotal : catalogTotal,
                })}
              </Box>
              {displayFiltered
                ? t('library.filters.counterFilteredTail', {
                    total: catalogTotal,
                  })
                : t('library.filters.counterRestTail')}
            </Typography>
          )}
        </>
      )}

      {initialLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          // SMA-271: in-place recovery — the current context re-runs from
          // page 1 (plus the types list if its mount fetch died), no reload.
          action={
            <Button color="inherit" size="small" onClick={handleRetry}>
              {t('library.retry')}
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* Two-column Flexbox shell (project design rule — no MUI Grid for the
          shell): the rail renders as a flex sibling so the plant grid reflows
          BESIDE it, never under it. On mobile the panel is a portal Drawer —
          the flex row only ever holds the results column. */}
      {!initialLoading && (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3 }}>
          {/* Rendered unconditionally (visibility is panelOpen's job): a
              fetch error must not yank an open rail out of the layout. Since
              SMA-271 the controls stay reachable during an error too, so the
              panel can be open next to the Alert — its counts are simply
              absent until a Retry succeeds. */}
          {filterPanel}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* found === 0 with no active filter = genuinely empty catalogue;
                with a query or facet active it's a no-match state. Gating uses
                the hook's isFiltered so it can't drift from the fetch's own
                match-all rule. */}
            {/* SMA-394: `displayTotal` reverts to `found`, `displayFiltered` to
                `isFiltered` (both empty states below). Without this an egg card
                shows beside a "no results" panel whenever the active facets
                match nothing in the catalogue. */}
            {!error && displayTotal === 0 && !displayFiltered && (
              <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
                <SpaIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
                <Typography>{t('library.noPlants')}</Typography>
              </Box>
            )}

            {!error && displayTotal === 0 && displayFiltered && (
              <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
                <Typography>{t('library.noResults')}</Typography>
                {/* Same reset as the header/"Tout effacer": facets only, the
                    search text stays (it may be the only active narrowing —
                    then the button is a no-op by design; the mockup's reset
                    affordance is unconditional). */}
                <Button
                  variant="outlined"
                  onClick={handleReset}
                  sx={{ mt: 2, borderRadius: 999, textTransform: 'none' }}
                >
                  {t('library.resetFilters')}
                </Button>
              </Box>
            )}

            {/* SMA-394: `displayItems` reverts to `items` (both uses below) */}
            {displayItems.length > 0 && (
              <>
                <Grid container spacing={3}>
                  {displayItems.map((plant) => {
                    const typeName = plantTypes.find(
                      (pt) => pt.id === plant.plantTypeId
                    )?.name;
                    return (
                      <Grid key={plant.id} size={{ xs: 12, sm: 6, md: 4 }}>
                        <PlantCard plant={plant} typeName={typeName} />
                      </Grid>
                    );
                  })}
                </Grid>

                {/* Polite, visually-hidden live region rendered once the list
                    has loaded (gated by !initialLoading && items.length > 0).
                    It announces the loaded/total count as pages append (Load
                    more / scroll); some screen readers may also announce the
                    initial count when it appears. */}
                <Box
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  sx={visuallyHidden}
                >
                  {/* SMA-394: `displayItems` reverts to `items`, `displayTotal` to `found` */}
                  {t('library.showing', {
                    shown: displayItems.length,
                    total: displayTotal,
                  })}
                </Box>

                {/* SMA-394: `displayHasMore` reverts to `hasMore` */}
                {displayHasMore && (
                  <>
                    {/* Decorative scroll sentinel — entering the viewport
                        auto-loads the next page. height:10 (vs 1px) is a
                        slightly larger intersection target for reliable
                        triggering; with rootMargin:'100px' the exact height
                        matters little. The button is the keyboard /
                        no-observer fallback. */}
                    <Box
                      ref={sentinelRef}
                      aria-hidden="true"
                      sx={{ height: 10 }}
                    />
                    <Box
                      sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}
                    >
                      <Button variant="outlined" onClick={loadMore}>
                        {t('library.loadMore')}
                      </Button>
                    </Box>
                  </>
                )}
              </>
            )}
          </Box>
        </Box>
      )}
    </Container>
  );
}
