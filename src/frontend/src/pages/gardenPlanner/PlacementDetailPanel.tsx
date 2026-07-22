import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { usePlannerTokens } from '../../theme/usePlannerTokens';
import type { Plant } from '../../types/Plant';
import { getPlantDisplayName } from '../../utils/getPlantDisplayName';
import {
  cellRef,
  cellSizeToMeters,
  spacingToFootprintCells,
  type FootprintFitResult,
} from './placementGeometry';
import type { PlannerPlacement } from './plannerReducer';

interface PlacementDetailPanelProps {
  placement: PlannerPlacement;
  plant: Plant | null;
  soil: string | undefined;
  language: string;
  // SMA-288: while the active-language catalog is pending, a missing plant is
  // indistinguishable from a not-yet-loaded one — the name slot stays empty
  // instead of flashing the unknown-plant fallback.
  catalogReady: boolean;
  /** Cell-size wire value — sizes the meters line and the source line. */
  cellSize: string;
  /** Grid dimensions — the steppers' hard upper bounds. */
  gridRows: number;
  gridCols: number;
  /**
   * Fit verdict for a draft span pair at the placement's own anchor with the
   * placement excluded — the page closes over grid/placements so the panel
   * and the reducer guard can never disagree (single-predicate principle).
   */
  checkFit: (spanRows: number, spanCols: number) => FootprintFitResult;
  /** Resolve an overlap verdict's placement id to warn-copy fields. */
  describeOverlap: (placementId: string) => { plant: string; cell: string };
  onSetFootprint: (spanRows: number, spanCols: number) => void;
  onMove: () => void;
  onRemove: () => void;
}

export const PlacementDetailPanel = memo(function PlacementDetailPanel({
  placement,
  plant,
  soil,
  language,
  catalogReady,
  cellSize,
  gridRows,
  gridCols,
  checkFit,
  describeOverlap,
  onSetFootprint,
  onMove,
  onRemove,
}: PlacementDetailPanelProps) {
  const { t } = useTranslation();
  const tk = usePlannerTokens();

  // Footprint section (5.5 lot 3, mockup Etats): the suggestion is a
  // SUGGESTION — the user owns the size (product ruling 2026-07-21). The
  // panel steps a LOCAL DRAFT: a fitting draft applies immediately; a misfit
  // stays DISPLAYED with the inline warn (mockup: the warn shows WITH the
  // out-of-range value) and dispatches nothing.
  const [draft, setDraft] = useState({
    rows: placement.spanRows,
    cols: placement.spanCols,
  });
  // Resync when the selection (or its committed spans) changes — the React
  // render-phase adjust pattern (no effect, no extra paint); a misfit draft
  // on the SAME placement survives, per the mockup.
  const [synced, setSynced] = useState(placement);
  if (
    synced.id !== placement.id ||
    synced.spanRows !== placement.spanRows ||
    synced.spanCols !== placement.spanCols
  ) {
    setSynced(placement);
    setDraft({ rows: placement.spanRows, cols: placement.spanCols });
  }

  const fit = checkFit(draft.rows, draft.cols);
  let warn: string | null = null;
  if (!fit.ok) {
    if (fit.reason === 'overlap') {
      const hit = describeOverlap(fit.overlapWith);
      warn = t('planner.place.footprintOverlapWarn', {
        plant: hit.plant,
        cell: hit.cell,
      });
    } else {
      warn = t('planner.place.footprintBlockedWarn');
    }
  }

  const step = (axis: 'rows' | 'cols', delta: 1 | -1) => {
    const next = {
      rows: axis === 'rows' ? draft.rows + delta : draft.rows,
      cols: axis === 'cols' ? draft.cols + delta : draft.cols,
    };
    setDraft(next);
    // Live apply-on-fit: the reducer re-guards with the same predicate, so a
    // dispatched value can never half-happen.
    if (checkFit(next.rows, next.cols).ok) {
      onSetFootprint(next.rows, next.cols);
    }
  };

  // Source line: the SINGLE cached Perenual value (lot-1 ruling — the data
  // corrects the mockup's decorative range); unknown reuses the lot-1 key.
  const spacingKnown = spacingToFootprintCells(
    plant?.xPlantSpacingValue ?? null,
    plant?.xPlantSpacingUnit ?? null,
    cellSize
  ).known;

  // Cells + meters line, from the DRAFT (the mockup shows the live value):
  // refs via the lot-1 cellRef util, meters = spans × cellSize, one decimal
  // with the locale separator (FR comma).
  const meters = cellSizeToMeters(cellSize);
  const fmtMeters = (v: number) =>
    v.toLocaleString(language, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  const footprintLine = t('planner.place.footprintLine', {
    from: cellRef(placement.startRow, placement.startCol),
    to: cellRef(
      placement.startRow + draft.rows - 1,
      placement.startCol + draft.cols - 1
    ),
    r: draft.rows,
    c: draft.cols,
    w: fmtMeters(draft.cols * meters),
    h: fmtMeters(draft.rows * meters),
  });

  // One stepper leg ("- N +"): buttons carry the aria contract; the value is
  // announced via its live region.
  const stepper = (axis: 'rows' | 'cols') => {
    const value = axis === 'rows' ? draft.rows : draft.cols;
    const max = axis === 'rows' ? gridRows : gridCols;
    const decKey = axis === 'rows' ? 'decreaseRows' : 'decreaseCols';
    const incKey = axis === 'rows' ? 'increaseRows' : 'increaseCols';
    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
        <IconButton
          size="small"
          aria-label={t(`planner.place.${decKey}`)}
          disabled={value <= 1}
          onClick={() => step(axis, -1)}
          sx={{ border: `1px solid ${tk.cardBd}`, borderRadius: '6px', width: 26, height: 26, fontSize: 15 }}
        >
          −
        </IconButton>
        <Box
          component="span"
          aria-live="polite"
          sx={{ minWidth: 20, textAlign: 'center', fontWeight: 700, fontSize: 14 }}
        >
          {value}
        </Box>
        <IconButton
          size="small"
          aria-label={t(`planner.place.${incKey}`)}
          disabled={value >= max}
          onClick={() => step(axis, 1)}
          sx={{ border: `1px solid ${tk.cardBd}`, borderRadius: '6px', width: 26, height: 26, fontSize: 15 }}
        >
          +
        </IconButton>
      </Box>
    );
  };

  return (
    // R4 (item F, owner preference): the panel is a plain card filling the
    // ALWAYS-reserved 330px right lane — the LANE (in GardenPlanner) owns
    // stickiness and scrolling; the panel no longer positions itself.
    // R5 (CR accept): planner-token surface (mode-aware, no theme drift).
    <Box
      sx={{
        width: '100%',
        p: 2,
        border: `1px solid ${tk.cardBd}`,
        borderRadius: '12px',
        bgcolor: tk.card,
        boxShadow: tk.shadow,
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

      {/* Footprint block (lot 3, collision artboard + Etats). */}
      <Box sx={{ mt: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {spacingKnown
            ? t('planner.place.footprintSource', {
                value: plant?.xPlantSpacingValue,
                unit: plant?.xPlantSpacingUnit,
              })
            : t('planner.place.footprintUnknown')}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mt: 1 }}>
          {stepper('rows')}
          <Typography component="span" sx={{ fontSize: 13, color: tk.tMeta }}>
            ×
          </Typography>
          {stepper('cols')}
          <Typography component="span" sx={{ fontSize: 13, color: tk.tMeta }}>
            {t('planner.place.cellsUnit')}
          </Typography>
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.75 }}
        >
          {footprintLine}
        </Typography>
        {warn && (
          <Box
            role="alert"
            sx={{
              mt: 1,
              p: '8px 10px',
              borderRadius: '8px',
              border: `1px solid ${tk.dangTx}`,
              backgroundImage: tk.redHatch,
              color: tk.dangTx,
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            {warn}
          </Box>
        )}
      </Box>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 1.5, fontStyle: 'italic' }}
      >
        {t('planner.placement.replaceHint')}
      </Typography>
      <Box sx={{ display: 'flex', gap: '8px', mt: 1.5 }}>
        {/* Move (mockup Etats): re-arms the placement's own plant — Place
            mode + the lot-2 drag take over from there. */}
        <Button size="small" variant="outlined" onClick={onMove}>
          {t('planner.place.move')}
        </Button>
        <Button color="error" size="small" onClick={onRemove}>
          {t('planner.placement.remove')}
        </Button>
      </Box>
    </Box>
  );
});
