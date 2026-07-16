import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import UndoIcon from '@mui/icons-material/Undo';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import { getPlannerTokens, type PlannerTokens } from '../../theme/plannerTokens';
import type { Moment, Season } from '../../utils/exposure';
import { ZOOM_MAX, ZOOM_MIN } from './plannerReducer';

const MOMENTS: Moment[] = ['morning', 'noon', 'evening'];
const SEASONS: Season[] = ['summer', 'winter'];

/**
 * Toolbar row-2 segmented control (tokens §10): `--seg-bg` container radius 9
 * padding 3; items radius 7, padding 8×14 (6×9 mobile), fs 13 (11.5) w700;
 * active = `--seg-on-bg`/`--seg-on-tx` + shadow. Options are toggle buttons
 * (visible text = accessible name, state via aria-pressed); the whole set is
 * disabled while the exposure layer is hidden.
 */
function PresetSegmented<T extends string>({
  options,
  labels,
  value,
  disabled,
  onChange,
  tk,
}: {
  options: T[];
  labels: Record<T, string>;
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
  tk: PlannerTokens;
}) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        gap: '2px',
        bgcolor: tk.segBg,
        borderRadius: '9px',
        p: '3px',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Box
            key={opt}
            component="button"
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(opt)}
            sx={{
              border: 'none',
              cursor: disabled ? 'default' : 'pointer',
              px: { xs: '9px', sm: '14px' },
              py: { xs: '6px', sm: '8px' },
              borderRadius: '7px',
              fontFamily: 'inherit',
              fontSize: { xs: 11.5, sm: 13 },
              fontWeight: 700,
              lineHeight: 1.2,
              bgcolor: active ? tk.segOnBg : 'transparent',
              color: active ? tk.segOnTx : tk.tMeta,
              boxShadow: active ? tk.segShadow : 'none',
              transition: 'background-color .15s, color .15s',
            }}
          >
            {labels[opt]}
          </Box>
        );
      })}
    </Box>
  );
}

interface GridControlsProps {
  hasGrid: boolean;
  shapeEditMode: boolean;
  zoom: number;
  canUndo: boolean;
  exposureVisible: boolean;
  exposureMoment: Moment;
  exposureSeason: Season;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onUndo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleExposure: () => void;
  onSetExposureMoment: (moment: Moment) => void;
  onSetExposureSeason: (season: Season) => void;
}

/**
 * The planner TOOLBAR CARD (SMA-17 5.3-D R2, mockup É1 / tokens §10): lives
 * in the grid column, above the grid card. Row 1 = editing actions (undo +
 * zoom; the mode buttons land here with their chantiers); row 2 = the
 * exposure layer controls. The page header owns the garden title and the
 * Réglages/Annuler/Enregistrer actions (relocated in R2).
 */
export const GridControls = memo(function GridControls({
  hasGrid,
  shapeEditMode,
  zoom,
  canUndo,
  exposureVisible,
  exposureMoment,
  exposureSeason,
  onSelectAll,
  onDeselectAll,
  onUndo,
  onZoomIn,
  onZoomOut,
  onToggleExposure,
  onSetExposureMoment,
  onSetExposureSeason,
}: GridControlsProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const tk = getPlannerTokens(theme.palette.mode === 'dark' ? 'dark' : 'light');

  const momentLabels: Record<Moment, string> = {
    morning: t('planner.exposure.moments.morning'),
    noon: t('planner.exposure.moments.noon'),
    evening: t('planner.exposure.moments.evening'),
  };
  const seasonLabels: Record<Season, string> = {
    summer: t('planner.exposure.seasons.summer'),
    winter: t('planner.exposure.seasons.winter'),
  };

  if (!hasGrid) return null;

  return (
    <Box
      sx={{
        bgcolor: tk.card,
        border: `1px solid ${tk.cardBd}`,
        borderRadius: '12px',
        boxShadow: tk.shadow,
        p: '12px 16px',
        mb: 1.5,
      }}
    >
      {/* Row 1 — editing actions. The LEFT slot is reserved for the mode
          buttons (Sélection / Placer / Infrastructures): Infrastructures
          ships with 5.4, Placer (DnD) with 5.5 — nothing rendered here yet. */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 2,
        }}
      >
        {shapeEditMode && (
          <>
            <Button variant="outlined" size="small" onClick={onSelectAll}>
              {t('planner.shape.selectAll')}
            </Button>
            <Button variant="outlined" size="small" onClick={onDeselectAll}>
              {t('planner.shape.deselectAll')}
            </Button>
          </>
        )}

        <IconButton
          size="small"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label={t('planner.toolbar.undo')}
        >
          <UndoIcon fontSize="small" />
        </IconButton>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
          <IconButton
            size="small"
            onClick={onZoomOut}
            disabled={zoom <= ZOOM_MIN}
            aria-label={t('planner.toolbar.zoomOut')}
          >
            <ZoomOutIcon fontSize="small" />
          </IconButton>
          <Typography
            variant="caption"
            sx={{ minWidth: 40, textAlign: 'center' }}
          >
            {Math.round(zoom * 100)}%
          </Typography>
          <IconButton
            size="small"
            onClick={onZoomIn}
            disabled={zoom >= ZOOM_MAX}
            aria-label={t('planner.toolbar.zoomIn')}
          >
            <ZoomInIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Full-width divider (§10: margin 12px -16px across the card padding) */}
      <Box sx={{ borderTop: `1px solid ${tk.divider}`, my: '12px', mx: '-16px' }} />

      {/* Row 2 (tokens §10): Exposition toggle + moment/season presets. The
          presets only drive the legend title until 5.4 ships cast shadows. */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WbSunnyIcon sx={{ color: tk.expoIcc, fontSize: 20 }} />
          {/* §10: switch 34×19, thumb 15, active --prim, inactive --track. */}
          <Switch
            checked={exposureVisible}
            onChange={onToggleExposure}
            slotProps={{
              input: {
                role: 'switch',
                'aria-label': t('planner.exposure.toggle'),
              },
            }}
            sx={{
              width: 34,
              height: 19,
              p: 0,
              '& .MuiSwitch-switchBase': {
                p: '2px',
                '&.Mui-checked': {
                  transform: 'translateX(15px)',
                  color: '#fff',
                  '& + .MuiSwitch-track': {
                    backgroundColor: tk.prim,
                    opacity: 1,
                  },
                },
              },
              '& .MuiSwitch-thumb': {
                width: 15,
                height: 15,
                boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
              },
              '& .MuiSwitch-track': {
                borderRadius: 9.5,
                backgroundColor: tk.track,
                opacity: 1,
              },
            }}
          />
          <Typography
            sx={{ fontSize: { xs: 12, sm: 13.5 }, fontWeight: 700, color: tk.tMeta }}
          >
            {t('planner.exposure.toggle')}
          </Typography>
        </Box>
        <PresetSegmented
          options={MOMENTS}
          labels={momentLabels}
          value={exposureMoment}
          disabled={!exposureVisible}
          onChange={onSetExposureMoment}
          tk={tk}
        />
        <PresetSegmented
          options={SEASONS}
          labels={seasonLabels}
          value={exposureSeason}
          disabled={!exposureVisible}
          onChange={onSetExposureSeason}
          tk={tk}
        />
      </Box>
    </Box>
  );
});
