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
import {
  fetchPlants,
  fetchPlantTypes,
  searchPlants,
} from '../services/plantApi';
import type { Plant } from '../types/Plant';
import type { PlantType } from '../types/PlantType';
import PlantCard from '../components/PlantCard';

// SMA-58 — front-pure infinite scroll. The list endpoint returns the whole
// catalogue (~545) in one shot, so we keep it all in memory but only RENDER a
// growing slice: 24 cards initially, +24 each time the scroll sentinel enters
// the viewport (or the Load more button is pressed). Keeps the DOM small and
// makes language switches cheap (≈24 cards re-rendered, not 545).
const INITIAL_VISIBLE = 24;
const VISIBLE_STEP = 24;

export default function PlantLibrary() {
  const { t } = useTranslation();
  const [plants, setPlants] = useState<Plant[]>([]);
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const { language } = useLanguage();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

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

  // Single consolidated list/search fetch — resolves the old mount double-fetch
  // [D] (two GET /api/plants fired at once). Empty query → full list; a lone
  // character → skip (wait for a 2nd char); ≥2 → debounced search. Every state
  // write lives inside the async `run` (never synchronously at the top of the
  // effect) to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    const controller = new AbortController();

    const run = async (signal: AbortSignal) => {
      try {
        const data =
          searchQuery.length === 0
            ? await fetchPlants(signal, language)
            : await searchPlants(searchQuery, language, signal);
        if (signal.aborted) return;
        setPlants(data);
        setError(null);
        // SMA-153: do NOT reset the visible slice here. The reset is owned by the
        // filter handlers (search / type) — the only inputs that change the
        // displayed SET. A language re-fetch re-localises the same plants in the
        // same order, so the slice is preserved and the cards reconcile in place
        // by id (text swaps; no unmount, page collapse, or scroll jump).
      } catch (err) {
        if (!signal.aborted && (err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : t('library.error'));
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    };

    if (searchQuery.length === 1) {
      return () => controller.abort(); // keep the current list, wait for a 2nd char
    }
    if (searchQuery.length === 0) {
      run(controller.signal);
      return () => controller.abort();
    }
    const timeout = setTimeout(() => run(controller.signal), 300);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [searchQuery, language, t]);

  const filteredPlants =
    activeType === null
      ? plants
      : plants.filter((p) => p.plantTypeId === activeType);

  const visiblePlants = filteredPlants.slice(0, visibleCount);
  const hasMore = visibleCount < filteredPlants.length;

  // Auto-load the next slice when the sentinel scrolls into view. Pure
  // client-side (no network) — the full filtered list is already in memory.
  // Guarded for environments without IntersectionObserver (jsdom); there the
  // Load more button + keyboard users keep the list reachable.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) =>
            Math.min(c + VISIBLE_STEP, filteredPlants.length)
          );
        }
      },
      // Preload the next slice ~100px before the sentinel reaches the viewport so
      // the new cards are there before the user hits the bottom (no visible pop).
      { rootMargin: '100px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, filteredPlants.length]);

  // Reset the slice on the inputs that change the displayed SET — the search text
  // and the type chip. NOT language: a language change re-localises the same
  // plants in place, so the slice is preserved (SMA-153). Resetting in handlers
  // (not an effect) keeps clear of react-hooks/set-state-in-effect.
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setVisibleCount(INITIAL_VISIBLE);
  };
  const handleTypeChange = (typeId: number | null) => {
    setActiveType(typeId);
    setVisibleCount(INITIAL_VISIBLE);
  };
  const handleLoadMore = () => {
    setVisibleCount((c) => Math.min(c + VISIBLE_STEP, filteredPlants.length));
  };

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

      {!loading && !error && plants.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <SpaIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
          <Typography>{t('library.noPlants')}</Typography>
        </Box>
      )}

      {!loading && plants.length > 0 && filteredPlants.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <Typography>{t('library.noResults')}</Typography>
        </Box>
      )}

      {!loading && filteredPlants.length > 0 && (
        <>
          <Grid container spacing={3}>
            {visiblePlants.map((plant) => {
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
              (gated by !loading && filteredPlants.length > 0). It announces the
              visible/total count as the slice grows (Load more / scroll); some
              screen readers may also announce the initial count when it appears. */}
          <Box
            role="status"
            aria-live="polite"
            aria-atomic="true"
            sx={visuallyHidden}
          >
            {t('library.showing', {
              shown: visiblePlants.length,
              total: filteredPlants.length,
            })}
          </Box>

          {hasMore && (
            <>
              {/* Decorative scroll sentinel — entering the viewport auto-loads the
                  next slice. height:10 (vs 1px) is a slightly larger intersection
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
