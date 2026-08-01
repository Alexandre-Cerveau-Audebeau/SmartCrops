import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import { footprintBadgeSx } from '../../theme/plannerTokens';
import { usePlannerTokens } from '../../theme/usePlannerTokens';

/**
 * Footprint badge (SMA-193 R2/R3), shared since SMA-18 by the sidebar list
 * rows AND the armed identity chip — and since SMA-309 by the placement
 * detail panel's identity header. ONE rendering so the three can never drift.
 * Known → "N×N" with the plain footprint aria; unknown → the dashed "1×1?"
 * whose tooltip carries the États-component explanation and whose aria
 * combines footprint + meaning (describeChild keeps the NAME while the open
 * tooltip becomes the DESCRIPTION).
 *
 * Extracted to its own module in SMA-309: it was a module-local function in
 * PlantSidebar, unreachable from the panel. `footprintBadgeSx` deliberately
 * stays in plannerTokens — a component module that also exported a style
 * helper would trip react-refresh/only-export-components, the same rule that
 * moved GAP_PX out of GardenGrid.
 */
export function FootprintBadge({
  fp,
}: {
  fp: { cells: number; known: boolean };
}) {
  const { t } = useTranslation();
  const tk = usePlannerTokens();
  return fp.known ? (
    <Box
      component="span"
      aria-label={t('planner.sidebar.footprint', { cells: fp.cells })}
      sx={footprintBadgeSx(tk, true, fp.cells > 1)}
    >
      {`${fp.cells}×${fp.cells}`}
    </Box>
  ) : (
    <Tooltip title={t('planner.place.footprintUnknown')} describeChild>
      <Box
        component="span"
        aria-label={`1×1 — ${t('planner.place.footprintUnknown')}`}
        sx={footprintBadgeSx(tk, false)}
      >
        1×1?
      </Box>
    </Tooltip>
  );
}
