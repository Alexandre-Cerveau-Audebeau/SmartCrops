import { useEffect, useRef, useState } from 'react';
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
import { useTheme } from '@mui/material/styles';
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
import type { PlantFinderFilters } from '../hooks/usePlantFinder';
import { fetchPlantTypes } from '../services/plantApi';
import type { PlantType } from '../types/PlantType';
import FilterPanel from '../components/library/FilterPanel';
import { ENUM_FACETS } from '../constants/facetVocabularies';
import PlantCard from '../components/PlantCard';

// SMA-255 T4 put the Library on the faceted finder endpoint (real server
// pagination); SMA-9 T1 moved that fetch orchestration wholesale into
// usePlantFinder; SMA-9 T2 added the filter panel (left rail on desktop,
// full-screen drawer on mobile) with the five enum facets — the old
// single-select type-chip row is retired, plant type is now a multi-select
// facet in the panel. This component is presentation + handlers: it owns the
// raw inputs (search text, facet selections, panel open state), hands them to
// the hook, and renders what comes back.

// Re-exported from its original home so the page size keeps a stable import
// path (the test suite's finder mock derives its page math from it).
export { PER_PAGE } from '../hooks/usePlantFinder';

export default function PlantLibrary() {
  const { t } = useTranslation();
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<PlantFinderFilters>(EMPTY_FILTERS);
  // Panel CLOSED by default (design brief) — the rest state shows the full
  // catalogue with no rail.
  const [panelOpen, setPanelOpen] = useState(false);
  const { language } = useLanguage();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const sentinelRef = useRef<HTMLDivElement | null>(null);

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
  } = usePlantFinder({ query: searchQuery, filters, language });

  // Plant types load once (mount). They're translated client-side via
  // `plantTypes.*`, so there's no need to refetch them on a language change.
  useEffect(() => {
    const controller = new AbortController();
    fetchPlantTypes(controller.signal)
      .then(setPlantTypes)
      .catch((err) => {
        if (err.name !== 'AbortError') console.error(err);
      });
    return () => controller.abort();
  }, []);

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
    if (!hasMore) return;
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
  }, [hasMore, items.length, loadMore]);

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
    const effectiveQueryChanged =
      searchQuery.length >= MIN_QUERY_LENGTH ||
      value.length >= MIN_QUERY_LENGTH;
    setSearchQuery(value);
    if (effectiveQueryChanged) resetToFirstPage();
  };

  // Atomic multi-value toggle: grouped chips (e.g. "Vivace" =
  // Perennial + HerbaceousPerennial) add or remove ALL their wire values
  // together — all-selected means remove all, anything missing means add the
  // missing ones.
  const handleToggleValues = (
    field: keyof PlantFinderFilters,
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

  const filterPanel = (
    <FilterPanel
      open={panelOpen}
      onClose={closePanel}
      plantTypes={plantTypes}
      vocabularies={ENUM_FACETS}
      facetCounts={facetCounts}
      catalogFacetCounts={catalogFacetCounts}
      catalogTotal={catalogTotal}
      filters={filters}
      onToggleValues={handleToggleValues}
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

      {!initialLoading && !error && (
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
              />
            ))}
          </Box>

          {/* Rich left-aligned counter line (mockup): the found count in
              bold/primary, the context tail in secondary. */}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            <Box
              component="span"
              sx={{ fontWeight: 700, color: 'primary.main' }}
            >
              {t('library.filters.resultCount', {
                count: isFiltered ? found : catalogTotal,
              })}
            </Box>
            {isFiltered
              ? t('library.filters.counterFilteredTail', {
                  total: catalogTotal,
                })
              : t('library.filters.counterRestTail')}
          </Typography>
        </>
      )}

      {initialLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
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
              transient fetch error must not yank an open rail out of the
              layout. On an INITIAL error the control row is gated away, so
              the panel can never have been opened. */}
          {filterPanel}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* found === 0 with no active filter = genuinely empty catalogue;
                with a query or facet active it's a no-match state. Gating uses
                the hook's isFiltered so it can't drift from the fetch's own
                match-all rule. */}
            {!error && found === 0 && !isFiltered && (
              <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
                <SpaIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
                <Typography>{t('library.noPlants')}</Typography>
              </Box>
            )}

            {!error && found === 0 && isFiltered && (
              <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
                <Typography>{t('library.noResults')}</Typography>
              </Box>
            )}

            {items.length > 0 && (
              <>
                <Grid container spacing={3}>
                  {items.map((plant) => {
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
                  {t('library.showing', {
                    shown: items.length,
                    total: found,
                  })}
                </Box>

                {hasMore && (
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
