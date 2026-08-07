import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import HideImageIcon from '@mui/icons-material/HideImage';
import type { PlantImage } from '../../types/Plant';
import { Sym } from '../Sym';

interface PlantGallerySectionProps {
  /** The stable (non-Perenual), canonically-sorted gallery images. */
  images: PlantImage[];
  /**
   * Open the lightbox on the currently-filtered subset at `index`, so its
   * prev/next arrows navigate exactly what the grid is showing.
   */
  onSelect: (images: PlantImage[], index: number) => void;
  /**
   * Replaces the default "no photos yet" line in the empty state (SMA-394).
   * Icon, layout, spacing and colours are unchanged — only the message swaps.
   * Omit it and the empty state is byte-identical to before.
   */
  emptyMessage?: ReactNode;
}

const ALL = 'all';

// Filmstrip column width — smaller than the original 196 so more than four tiles
// are visible at once before the row scrolls. Adjustable.
const TILE_W = 150;

// Hatched placeholder background (design HTML) for a tile whose image has no
// resolvable URL — keeps the 4/3 cell filled instead of collapsing.
const EMPTY_HATCH =
  'repeating-linear-gradient(45deg,#eef4ec,#eef4ec 9px,#e4ede2 9px,#e4ede2 18px)';

/**
 * One credit line under a thumbnail, in the design format "{credit} · {license}".
 * Both values come from the real DTO fields; when a tile carries neither (rare on
 * the stable Trefle pool), it falls back to the pool's "Trefle · CC-BY-SA" rather
 * than inventing an English string. Per-photo descriptive captions are deferred
 * (SMA-177), so this line is the only text under a tile.
 */
function creditLine(img: PlantImage): string {
  const parts = [img.credit, img.licenseName].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Trefle · CC-BY-SA';
}

/**
 * Inline photo gallery for Plant Detail v2 (SMA-154; tiles restyled to the Claude
 * Design HTML in SMA-39). ImageType filter chips (a "All" pill + one per type
 * actually present — Perenual is filtered upstream, so "Main" never shows) drive a
 * two-row horizontal filmstrip: uniform 4/3 thumbnails fill column-by-column over
 * two rows, and beyond what fits the row scrolls horizontally (height-bounded, no
 * cap on photo count) with an always-visible discreet scrollbar. Each tile carries
 * a dark-green type badge top-left and a monospace credit/license line; a tile
 * with no URL falls back to a hatched placeholder. Clicking a tile hands the
 * FILTERED subset + index back to the page, which reuses the existing
 * PhotoLightbox. Data/lightbox/empty-state wiring is unchanged from SMA-154.
 */
export default function PlantGallerySection({
  images,
  onSelect,
  emptyMessage,
}: PlantGallerySectionProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<string>(ALL);

  // Distinct ImageTypes present, in canonical gallery order — `images` is already
  // canonically sorted, so first-seen order is the canonical type order.
  const presentTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const img of images) seen.add(img.imageType);
    return Array.from(seen);
  }, [images]);

  // Guard against a filter whose type is no longer present (e.g. plant changed).
  const activeFilter =
    filter !== ALL && !presentTypes.includes(filter) ? ALL : filter;

  const filtered = useMemo(
    () =>
      activeFilter === ALL
        ? images
        : images.filter((i) => i.imageType === activeFilter),
    [images, activeFilter]
  );

  if (images.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 5, color: 'text.secondary' }}>
        <HideImageIcon sx={{ fontSize: 40, opacity: 0.5, mb: 1 }} />
        {emptyMessage ?? (
          <Typography>{t('plantDetail.gallery.empty')}</Typography>
        )}
      </Box>
    );
  }

  return (
    <Box>
      {/* Filter chips only when there's more than one type to choose between. */}
      {presentTypes.length > 1 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px', mb: '16px' }}>
          {[ALL, ...presentTypes].map((type) => {
            const active = activeFilter === type;
            const label =
              type === ALL
                ? t('plantDetail.gallery.types.all')
                : t(`plantDetail.gallery.types.${type}`, type);
            return (
              <Box
                component="button"
                type="button"
                key={type}
                onClick={() => setFilter(type)}
                aria-pressed={active}
                sx={{
                  borderRadius: '999px',
                  px: '14px',
                  py: '6px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  bgcolor: active ? 'primary.main' : 'surfaceSubtle',
                  color: active ? '#fff' : 'text.primary',
                  border: '1px solid',
                  borderColor: active ? 'primary.main' : 'borderSubtle',
                  '&:focus-visible': {
                    outline: '2px solid',
                    outlineColor: 'primary.main',
                    outlineOffset: 2,
                  },
                }}
              >
                {label}
              </Box>
            );
          })}
        </Box>
      )}

      {/* Two-row horizontal filmstrip: uniform tiles fill column-by-column over two
          rows; beyond what fits, the row scrolls horizontally (height-bounded, no
          cap on photo count). The scrollbar is rendered permanently (overflowX:
          'scroll' + a discreet styled track) so the affordance is always visible. */}
      <Box
        sx={{
          display: 'grid',
          gridAutoFlow: 'column',
          gridTemplateRows: 'repeat(2, auto)',
          gridAutoColumns: `${TILE_W}px`,
          gap: '14px',
          overflowX: 'scroll',
          overflowY: 'hidden',
          pb: '8px',
          scrollbarWidth: 'thin',
          scrollbarColor: (theme) =>
            `${theme.palette.borderSubtle} transparent`,
          '&::-webkit-scrollbar': { height: '8px' },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
            borderRadius: '8px',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: (theme) => theme.palette.borderSubtle,
            borderRadius: '8px',
          },
        }}
      >
        {filtered.map((img, idx) => {
          const src = img.thumbnailUrl ?? img.url;
          const imageTypeLabel = t(
            `plantDetail.gallery.types.${img.imageType}`,
            img.imageType
          );
          return (
            <Box
              key={img.id}
              sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
            >
              <Box
                component="button"
                type="button"
                onClick={() => onSelect(filtered, idx)}
                aria-label={t('plantDetail.gallery.openTile', {
                  index: idx + 1,
                })}
                sx={{
                  position: 'relative',
                  border: 'none',
                  p: 0,
                  cursor: 'pointer',
                  aspectRatio: '4 / 3',
                  borderRadius: '11px',
                  overflow: 'hidden',
                  bgcolor: 'grey.100',
                  display: 'block',
                  width: '100%',
                  '&:focus-visible': {
                    outline: '2px solid',
                    outlineColor: 'primary.main',
                    outlineOffset: 2,
                  },
                }}
              >
                {src ? (
                  <Box
                    component="img"
                    src={src}
                    alt={imageTypeLabel}
                    loading="lazy"
                    sx={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                ) : (
                  <Box
                    sx={{
                      width: '100%',
                      height: '100%',
                      background: EMPTY_HATCH,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Sym name="image" size={28} color="#9aa5a0" />
                  </Box>
                )}
                {/* Type badge — dark-green pill, white text, top-left. */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: '8px',
                    top: '8px',
                    bgcolor: 'rgba(27,94,58,0.9)',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    px: '8px',
                    py: '3px',
                    borderRadius: '6px',
                    pointerEvents: 'none',
                  }}
                >
                  {imageTypeLabel}
                </Box>
              </Box>
              {/* Credit / license line (monospace, design). */}
              <Box
                sx={{
                  fontSize: 10,
                  fontFamily: 'ui-monospace, monospace',
                  color: 'mutedText',
                }}
              >
                {creditLine(img)}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
