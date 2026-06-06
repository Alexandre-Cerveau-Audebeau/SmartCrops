import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type { Plant } from '../types/Plant';
import { PLANT_HERO_PLACEHOLDER } from '../utils/plantDetail';

interface PlantCardProps {
  /** A list-DTO plant item (carries the flat commonName/description/imageUrl/wateringNeedLevel). */
  plant: Plant;
  /** Resolved plant-type name for the category chip; the chip localises it via `plantTypes.*`. */
  typeName?: string | null;
  /** Optional accessible label for the card link (e.g. the homepage's "View details for X"). */
  ariaLabel?: string;
}

/**
 * Shared Library / Homepage plant card (SMA-118 / SMA-5) — single source of truth so
 * the two surfaces stay visually identical. Renders a stable-source image (brand
 * placeholder + loop-guarded onError fallback), the localised common name + scientific
 * subtitle, a localised type chip, a 2-line-clamped description, and a bottom-pinned
 * footer (watering — preferring the broad Perenual `wateringNeedLevel`, with the legacy
 * `waterNeeds` as fallback — plus sun when present) and image attribution.
 *
 * Sizing-agnostic: fills its parent (height:100%), so the caller controls width and
 * row-stretch — a `<Grid>` cell in the Library, a flex item on the homepage.
 */
export default function PlantCard({ plant, typeName, ariaLabel }: PlantCardProps) {
  const { t } = useTranslation();

  const displayName = plant.commonName ?? plant.scientificName;
  const wateringLabel = plant.wateringNeedLevel
    ? t(`plantDetail.enumValues.wateringNeed.${plant.wateringNeedLevel}`, plant.wateringNeedLevel)
    : plant.waterNeeds
      ? t(`plantValues.${plant.waterNeeds}`, plant.waterNeeds)
      : null;
  const sunLabel = plant.sunExposure
    ? t(`plantValues.${plant.sunExposure}`, plant.sunExposure)
    : null;

  return (
    <Box
      component={RouterLink}
      to={`/library/${plant.id}`}
      aria-label={ariaLabel}
      sx={{ textDecoration: 'none', color: 'inherit', display: 'block', height: '100%' }}
    >
      <Card
        variant="outlined"
        sx={{
          borderRadius: 3,
          cursor: 'pointer',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          transition: 'box-shadow 0.2s ease, transform 0.2s ease',
          '&:hover': {
            boxShadow: 3,
            transform: 'translateY(-2px)',
          },
        }}
      >
        <CardMedia
          component="img"
          image={plant.imageUrl || PLANT_HERO_PLACEHOLDER}
          alt={displayName}
          onError={(e) => {
            // Filet (SMA-118/5a): if a "stable" URL still fails to load, swap to the
            // brand placeholder. The dataset flag prevents an error loop (the
            // placeholder is a data: URI that always loads).
            const img = e.currentTarget as HTMLImageElement & { dataset: DOMStringMap };
            if (!img.dataset.fallback) {
              img.dataset.fallback = '1';
              img.src = PLANT_HERO_PLACEHOLDER;
            }
          }}
          sx={{ height: 140, objectFit: 'cover', bgcolor: 'action.hover' }}
        />
        <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="h6" fontWeight={600}>
            {displayName}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontStyle: 'italic', mb: 1 }}
          >
            {plant.scientificName}
          </Typography>

          {typeName && (
            <Chip
              label={t(`plantTypes.${typeName}`, typeName)}
              size="small"
              color="primary"
              variant="outlined"
              sx={{ mb: 1 }}
            />
          )}

          {plant.description && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mb: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {plant.description}
            </Typography>
          )}

          {/* Footer pinned to the card bottom (mt:auto) so the info line + attribution
              align across cards regardless of description length. */}
          <Box sx={{ mt: 'auto', pt: 1 }}>
            {(wateringLabel || sunLabel) && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {wateringLabel && `${t('library.water')}: ${wateringLabel}`}
                {wateringLabel && sunLabel && ' · '}
                {sunLabel && `${t('library.sun')}: ${sunLabel}`}
              </Typography>
            )}

            {plant.imageAttribution && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.5, fontSize: '0.65rem', opacity: 0.7 }}
              >
                {plant.imageAttribution}
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
