import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import HideImageIcon from '@mui/icons-material/HideImage';
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

/**
 * Inline photo gallery for Plant Detail v2 (SMA-154). Renders the whole stable
 * pool (no capping) as a thumbnail grid with filter chips for the ImageTypes
 * actually present (Perenual images are filtered upstream, so "Main" never shows).
 * Each tile carries a localised type badge and a one-line attribution; clicking a
 * tile hands the FILTERED subset + index back to the page, which reuses the
 * existing PhotoLightbox. Descriptive per-photo captions are deferred (SMA-177).
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
    const seen: string[] = [];
    for (const img of images) {
      if (!seen.includes(img.imageType)) seen.push(img.imageType);
    }
    return seen;
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

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, 1fr)',
            sm: 'repeat(3, 1fr)',
            md: 'repeat(4, 1fr)',
          },
          gap: 1.5,
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
                aspectRatio: '1 / 1',
                borderRadius: 2,
                overflow: 'hidden',
                cursor: 'pointer',
                bgcolor: 'grey.100',
                p: 0,
                border: 0,
                width: '100%',
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
                width={img.width ?? undefined}
                height={img.height ?? undefined}
                sx={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
              {/* Type badge — translucent dark chip stays legible over any photo. */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 6,
                  left: 6,
                  px: 0.75,
                  py: 0.25,
                  borderRadius: 1,
                  bgcolor: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                  pointerEvents: 'none',
                }}
              >
                {t(`plantDetail.gallery.types.${img.imageType}`, img.imageType)}
              </Box>
            </Box>
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              title={img.attribution}
              sx={{ display: 'block', mt: 0.5 }}
            >
              {img.attribution}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
