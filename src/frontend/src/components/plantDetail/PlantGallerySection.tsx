import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import HideImageIcon from '@mui/icons-material/HideImage';
import { NAV_BG } from '../../constants/colors';
import type { PlantImage } from '../../types/Plant';

interface PlantGallerySectionProps {
  /** The stable (non-Perenual), canonically-sorted gallery images. */
  images: PlantImage[];
  /**
   * Open the lightbox on the currently-filtered subset at `index`, so its
   * prev/next arrows navigate exactly what the grid is showing.
   */
  onSelect: (images: PlantImage[], index: number) => void;
}

const ALL = 'all';

/** Compose a one-line attribution from the raw image fields: © credit · source · license. */
function composeAttribution(img: PlantImage): string {
  return [img.credit ? `© ${img.credit}` : null, img.source, img.licenseName]
    .filter(Boolean)
    .join(' · ');
}

/**
 * One attribution line under a thumbnail: monospace, truncated with an ellipsis,
 * click to expand to the full text (and click again to collapse). Per-tile state
 * is local so toggling one line never re-renders the whole grid.
 */
function GalleryAttribution({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      title={text}
      onClick={() => setExpanded((v) => !v)}
      sx={{
        fontFamily: 'monospace',
        display: 'block',
        mt: 0.5,
        cursor: 'pointer',
        ...(expanded
          ? { whiteSpace: 'normal' }
          : {
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }),
      }}
    >
      {text}
    </Typography>
  );
}

/**
 * Inline photo gallery for Plant Detail v2 (SMA-154). Renders the whole stable
 * pool (no capping) as uniform landscape thumbnails laid out in a two-row
 * horizontal filmstrip — only the height is bounded; every photo stays reachable
 * by scrolling. Filter chips cover the ImageTypes actually present (Perenual is
 * filtered upstream, so "Main" never shows). Each tile carries a brand type badge
 * and a one-line attribution; clicking a tile hands the FILTERED subset + index
 * back to the page, which reuses the existing PhotoLightbox. Descriptive per-photo
 * captions are deferred (SMA-177).
 */
export default function PlantGallerySection({
  images,
  onSelect,
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
        <Typography>{t('plantDetail.gallery.empty')}</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Filter chips only when there's more than one type to choose between. */}
      {presentTypes.length > 1 && (
        <Stack
          direction="row"
          spacing={1}
          flexWrap="wrap"
          useFlexGap
          sx={{ mb: 2 }}
        >
          <Chip
            label={t('plantDetail.gallery.types.all')}
            color={activeFilter === ALL ? 'primary' : 'default'}
            variant={activeFilter === ALL ? 'filled' : 'outlined'}
            onClick={() => setFilter(ALL)}
            size="small"
          />
          {presentTypes.map((type) => (
            <Chip
              key={type}
              label={t(`plantDetail.gallery.types.${type}`, type)}
              color={activeFilter === type ? 'primary' : 'default'}
              variant={activeFilter === type ? 'filled' : 'outlined'}
              onClick={() => setFilter(type)}
              size="small"
            />
          ))}
        </Stack>
      )}

      {/* Two-row horizontal filmstrip: uniform tiles fill column-by-column over two
          rows; beyond what fits, the row scrolls horizontally (height-bounded, no
          cap on photo count). Scrollbar themed in brand green. */}
      <Box
        sx={{
          display: 'grid',
          gridAutoFlow: 'column',
          gridTemplateRows: 'repeat(2, auto)',
          gridAutoColumns: '196px',
          gap: 1.5,
          overflowX: 'auto',
          pb: 1,
          scrollbarWidth: 'thin',
          scrollbarColor: `${NAV_BG} transparent`,
          '&::-webkit-scrollbar': { height: 8 },
          '&::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: NAV_BG,
            borderRadius: 4,
          },
        }}
      >
        {filtered.map((img, idx) => (
          <Box key={img.id}>
            <Box
              component="button"
              type="button"
              onClick={() => onSelect(filtered, idx)}
              aria-label={t('plantDetail.gallery.openTile', { index: idx + 1 })}
              sx={{
                position: 'relative',
                width: '100%',
                aspectRatio: '3 / 2',
                borderRadius: 2,
                overflow: 'hidden',
                cursor: 'pointer',
                bgcolor: 'grey.100',
                p: 0,
                border: 0,
                display: 'block',
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: 2,
                },
              }}
            >
              <Box
                component="img"
                src={img.thumbnailUrl ?? img.url}
                alt={img.imageType}
                loading="lazy"
                sx={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
              {/* Type badge — solid brand-green pill, white text, normal case. */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 6,
                  left: 6,
                  px: 0.75,
                  py: 0.25,
                  borderRadius: 1.5,
                  bgcolor: NAV_BG,
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                  pointerEvents: 'none',
                }}
              >
                {t(`plantDetail.gallery.types.${img.imageType}`, img.imageType)}
              </Box>
            </Box>
            <GalleryAttribution text={composeAttribution(img)} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
