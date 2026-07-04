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
import { visuallyHidden } from '@mui/utils';
import SearchIcon from '@mui/icons-material/Search';
import SpaIcon from '@mui/icons-material/Spa';
import { useLanguage } from '../hooks/useLanguage';
import { MIN_QUERY_LENGTH, usePlantFinder } from '../hooks/usePlantFinder';
import { fetchPlantTypes } from '../services/plantApi';
import type { PlantType } from '../types/PlantType';
import PlantCard from '../components/PlantCard';

// SMA-255 T4 put the Library on the faceted finder endpoint (real server
// pagination); SMA-9 T1 moved that fetch orchestration wholesale into
// usePlantFinder. This component is presentation + handlers: it owns the raw
// inputs (search text, active type chip), hands them to the hook, and renders
// what comes back.

// Re-exported from its original home so the page size keeps a stable import
// path (the test suite's finder mock derives its page math from it).
export { PER_PAGE } from '../hooks/usePlantFinder';

export default function PlantLibrary() {
  const { t } = useTranslation();
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState<number | null>(null);
  const { language } = useLanguage();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // The hook also returns facetCounts (T2 facet-rail seam) — no consumer here
  // yet, so it stays undestructured.
  const {
    items,
    found,
    initialLoading,
    error,
    hasMore,
    loadMore,
    resetToFirstPage,
  } = usePlantFinder({ query: searchQuery, activeType, language });

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
  // text and the type chip. NOT language: the hook's language branch refetches
  // the loaded pages in place, so the visible slice is preserved (SMA-153).
  // Resetting in handlers (not an effect) keeps clear of
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
  const handleTypeChange = (typeId: number | null) => {
    setActiveType(typeId);
    resetToFirstPage();
  };

  // Same derivation as the hook's effective query: 0–1 chars = match-all,
  // i.e. not filtering.
  const isFiltered =
    searchQuery.length >= MIN_QUERY_LENGTH || activeType !== null;

  return (
    <Container maxWidth="lg" sx={{ pt: 4, pb: 6 }}>
      <Typography variant="h4" fontWeight={700} color="primary" sx={{ mb: 3 }}>
        {t('library.title')}
      </Typography>

      {!initialLoading && !error && (
        <>
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
            sx={{ mb: 2, maxWidth: 500 }}
          />

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
            <Chip
              label={t('library.allTypes')}
              color={activeType === null ? 'primary' : 'default'}
              variant={activeType === null ? 'filled' : 'outlined'}
              onClick={() => handleTypeChange(null)}
            />
            {plantTypes.map((pt) => (
              <Chip
                key={pt.id}
                label={t(`plantTypes.${pt.name}`, pt.name)}
                color={activeType === pt.id ? 'primary' : 'default'}
                variant={activeType === pt.id ? 'filled' : 'outlined'}
                onClick={() => handleTypeChange(pt.id)}
              />
            ))}
          </Box>
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

      {/* found === 0 with no active filter = genuinely empty catalogue; with a
          query or chip active it's a no-match state. Same components as before
          T4 — only the gating source changed (server `found` instead of the
          in-memory array lengths). */}
      {!initialLoading && !error && found === 0 && !isFiltered && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <SpaIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
          <Typography>{t('library.noPlants')}</Typography>
        </Box>
      )}

      {!initialLoading && !error && found === 0 && isFiltered && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <Typography>{t('library.noResults')}</Typography>
        </Box>
      )}

      {!initialLoading && items.length > 0 && (
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

          {/* Polite, visually-hidden live region rendered once the list has loaded
              (gated by !initialLoading && items.length > 0). It announces the
              loaded/total count as pages append (Load more / scroll); some
              screen readers may also announce the initial count when it appears. */}
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
              {/* Decorative scroll sentinel — entering the viewport auto-loads the
                  next page. height:10 (vs 1px) is a slightly larger intersection
                  target for reliable triggering; with rootMargin:'100px' the exact
                  height matters little. The button is the keyboard / no-observer
                  fallback. */}
              <Box ref={sentinelRef} aria-hidden="true" sx={{ height: 10 }} />
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Button variant="outlined" onClick={loadMore}>
                  {t('library.loadMore')}
                </Button>
              </Box>
            </>
          )}
        </>
      )}
    </Container>
  );
}
