import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import type { Plant } from '../../types/Plant';
import { getPlantDisplayName } from '../../utils/getPlantDisplayName';
import type { PlannerPlacement } from './plannerReducer';

// Extension point (Phase-5 mockups): exposure info and footprint controls
// will land in this panel.

interface PlacementDetailPanelProps {
  placement: PlannerPlacement;
  plant: Plant | null;
  soil: string | undefined;
  top: number;
  language: string;
  // SMA-288: while the active-language catalog is pending, a missing plant is
  // indistinguishable from a not-yet-loaded one — the name slot stays empty
  // instead of flashing the unknown-plant fallback.
  catalogReady: boolean;
  onRemove: () => void;
}

export const PlacementDetailPanel = memo(function PlacementDetailPanel({
  placement,
  plant,
  soil,
  top,
  language,
  catalogReady,
  onRemove,
}: PlacementDetailPanelProps) {
  const { t } = useTranslation();

  return (
    // R3 (item F, product amendment): the panel lives in a RESERVED 330px
    // right lane in the main row — sticky within it, never overlapping the
    // grid (it was a fixed overlay at right:20 before).
    <Box
      sx={{
        position: 'sticky',
        top,
        width: '100%',
        p: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper',
        boxShadow: 3,
      }}
    >
      <Typography variant="subtitle1" fontWeight={600}>
        {/* Shared Library resolver (SMA-194); localized unknown fallback (F4),
            reserved for plants missing from a READY catalog (SMA-288). */}
        {plant
          ? getPlantDisplayName(plant, language)
          : catalogReady
            ? t('planner.unknownPlant')
            : null}
      </Typography>
      {plant && (
        <Typography
          variant="body2"
          sx={{ fontStyle: 'italic', color: 'text.secondary', mb: 1 }}
        >
          {plant.scientificName}
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary">
        {t('planner.placement.position', {
          row: placement.startRow,
          col: placement.startCol,
        })}
      </Typography>
      {soil && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {t('planner.placement.soil', { soil })}
        </Typography>
      )}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 1.5, fontStyle: 'italic' }}
      >
        {t('planner.placement.replaceHint')}
      </Typography>
      <Button color="error" size="small" onClick={onRemove} sx={{ mt: 1.5 }}>
        {t('planner.placement.remove')}
      </Button>
    </Box>
  );
});
