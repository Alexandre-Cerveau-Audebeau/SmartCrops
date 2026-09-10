import { memo, useMemo } from 'react';
import Box from '@mui/material/Box';
import TemplatePreview from '../Garden/TemplatePreview';
import { useDashboardTokens } from '../../theme/useDashboardTokens';
import type { DashboardGardenData } from '../../types/DashboardData';
import { gardenToPreview } from '../../utils/gardenPreview';

interface Props {
  garden: DashboardGardenData;
  maxW: number;
  maxH: number;
}

/**
 * SMA-336 PR 2/5 — a garden's plan, small.
 *
 * The drawing is `TemplatePreview`, unchanged: same cells, same soils, same
 * infrastructure fills, same per-plant colours as the planner grid. This wrapper
 * only supplies the three things it could not know on its own — the adapted
 * plan, the box to fit, and the night cell the widget card needs.
 *
 * A garden whose layout was never saved has no plan to draw and renders
 * NOTHING: an empty rectangle here would read as an empty garden, which is a
 * different statement. The row says so in words instead.
 */
function GardenThumbnail({ garden, maxW, maxH }: Props) {
  const tk = useDashboardTokens();
  const width = garden.width ?? 0;
  const height = garden.height ?? 0;

  const plan = useMemo(
    () =>
      width > 0 && height > 0
        ? gardenToPreview(garden.cellsJson, width, height, garden.placements)
        : null,
    [garden.cellsJson, garden.placements, width, height]
  );

  if (!plan) return null;

  return (
    <Box sx={{ flexShrink: 0, lineHeight: 0 }}>
      <TemplatePreview
        template={plan}
        fitTo={{ maxW, maxH }}
        cellColors={{ on: tk.thumbCellOn, frame: tk.thumbCellFrame }}
      />
    </Box>
  );
}

export default memo(GardenThumbnail);
