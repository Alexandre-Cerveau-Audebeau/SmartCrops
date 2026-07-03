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
import { visuallyHidden } from '@mui/utils';
import SearchIcon from '@mui/icons-material/Search';
import SpaIcon from '@mui/icons-material/Spa';
import { useLanguage } from '../hooks/useLanguage';
import { fetchPlantTypes, findPlants } from '../services/plantApi';
import type { Plant } from '../types/Plant';
import type { PlantType } from '../types/PlantType';
import PlantCard from '../components/PlantCard';

// SMA-255 T4 — the Library now runs on the faceted finder endpoint with REAL
// server pagination: 24 items per page, the scroll sentinel (or Load more)
// fetches the next page and APPENDS it. Search (typo-tolerant, localized) and
// the type chips are server filters on the same single data path — no more
// full-catalogue load, client-side type filtering, or client-side slicing
// (which SMA-58 needed when the list endpoint returned everything at once).
const PER_PAGE = 24;

// The finder waits for a 2nd character before searching (single letters are
// too broad to be a useful query); 0–1 chars behave as match-all.
const MIN_QUERY_LENGTH = 2;

export default function PlantLibrary() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Plant[]>([]);
  const [found, setFound] = useState(0);
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const { language } = useLanguage();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Snapshot of the last fetch context so the effect can tell WHAT changed:
  // a filter (q/type → replace from page 1), the language (refetch the
  // currently loaded pages), or the page number (append the next page).
  const prevRef = useRef<{
    q: string;
    type: number | null;
    lang: string;
    page: number;
  } | null>(null);
  // In-flight guard: the sentinel can fire repeatedly while a page is still
  // loading; page bumps are ignored until the current fetch settles.
  const fetchingRef = useRef(false);

  // 0–1 chars = match-all; the debounce below only applies to real queries.
  const effectiveQuery =
    searchQuery.length >= MIN_QUERY_LENGTH ? searchQuery : '';

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

  // Single consolidated finder fetch — every state (initial, search, type
  // chip, language, next page) goes through findPlants. Every state write
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
        } else if (pageAdvanced) {
          const data = await findPlants({ ...baseParams, page }, signal);
          if (signal.aborted) return;
          setItems((current) => [...current, ...data.items]);
          setFound(data.found);
        } else {
          // Context change (or initial load): fetch page 1 and REPLACE.
          const data = await findPlants({ ...baseParams, page: 1 }, signal);
          if (signal.aborted) return;
          setItems(data.items);
          setFound(data.found);
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
          setError(err instanceof Error ? err.message : t('library.error'));
        }
      } finally {
        fetchingRef.current = false;
        if (!signal.aborted) setLoading(false);
      }
    };

    // Debounce only the typed query — chip clicks, language switches and
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
    // Raw searchQuery is deliberately NOT a dep: a 0↔1-char keystroke leaves
    // effectiveQuery unchanged and requires no work at all.
  }, [effectiveQuery, activeType, language, page, t]);

  const hasMore = items.length > 0 && items.length < found;

  // Shared by the scroll sentinel and the Load more button. Advances at most
  // ONE page beyond the last fetched context — a double fire (sentinel +
  // button, or two rapid clicks) before the effect runs must not skip a page —
  // and no-ops while a page is in flight.
  const handleLoadMore = useCallback(() => {
    if (fetchingRef.current || !hasMore) return;
    setPage((p) =>
      prevRef.current !== null && p > prevRef.current.page ? p : p + 1
    );
  }, [hasMore]);

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
          handleLoadMore();
        }
      },
      // Preload the next page ~100px before the sentinel reaches the viewport
      // so the new cards are there before the user hits the bottom.
      { rootMargin: '100px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, items.length, handleLoadMore]);

  // Reset to page 1 on the inputs that change the displayed SET — the search
  // text and the type chip. NOT language: the language effect branch refetches
  // the loaded pages in place, so the visible slice is preserved (SMA-153).
  // Resetting in handlers (not an effect) keeps clear of
  // react-hooks/set-state-in-effect.
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };
  const handleTypeChange = (typeId: number | null) => {
    setActiveType(typeId);
    setPage(1);
  };

  const isFiltered = effectiveQuery !== '' || activeType !== null;

  return (
    <Container maxWidth="lg" sx={{ pt: 4, pb: 6 }}>
      <Typography variant="h4" fontWeight={700} color="primary" sx={{ mb: 3 }}>
        {t('library.title')}
      </Typography>

      {!loading && !error && (
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

      {loading && (
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
      {!loading && !error && found === 0 && !isFiltered && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <SpaIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
          <Typography>{t('library.noPlants')}</Typography>
        </Box>
      )}

      {!loading && !error && found === 0 && isFiltered && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <Typography>{t('library.noResults')}</Typography>
        </Box>
      )}

      {!loading && items.length > 0 && (
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
              (gated by !loading && items.length > 0). It announces the
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
                <Button variant="outlined" onClick={handleLoadMore}>
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
