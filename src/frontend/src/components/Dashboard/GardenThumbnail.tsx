import { memo, useMemo } from 'react';
import Box from '@mui/material/Box';
import TemplatePreview from '../Garden/TemplatePreview';
import { useDashboardTokens } from '../../theme/useDashboardTokens';
import type { DashboardGardenData } from '../../types/DashboardData';
import { gardenToPreview } from '../../utils/gardenPreview';

/** The plan in a box it must fit (the Gardens card's 48 px), or covering the frame it is mounted in (the Novice card's band — V1). */
type Props = { garden: DashboardGardenData } & (
  | { fit?: 'contain'; maxW: number; maxH: number }
  | { fit: 'cover'; maxW?: never; maxH?: never }
);

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
 *
 * `fit="cover"` (SMA-448, lot F2 — PR #296, fix round 1, V1): the plan
 * covers the positioned frame it is mounted in, from edge to edge, its ratio
 * kept, cropped — the Novice card's band, as V3-00 B draws it.
 */
function GardenThumbnail(props: Props) {
  const { garden } = props;
  const cover = props.fit === 'cover';
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

  // Under cover the wrapper IS the frame's box (`inset: 0` in a positioned
  // frame): what the plan's minimum sizes and its ratio are resolved against.
  return (
    <Box sx={cover ? { position: 'absolute', inset: 0 } : { flexShrink: 0, lineHeight: 0 }}>
      <TemplatePreview
        template={plan}
        fitTo={cover ? { cover: true } : { maxW: props.maxW, maxH: props.maxH }}
        cellColors={{ on: tk.thumbCellOn, frame: tk.thumbCellFrame }}
      />
    </Box>
  );
}

export default memo(GardenThumbnail);
