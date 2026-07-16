import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import SaveIcon from '@mui/icons-material/Save';
import SettingsIcon from '@mui/icons-material/Settings';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import { ZOOM_MAX, ZOOM_MIN } from './plannerReducer';

// Extension point (Phase-5 mockups): the exposure-layer toggles
// (moment/season) will slot into this toolbar.

interface GridControlsProps {
  gardenName: string | undefined;
  hasGrid: boolean;
  shapeEditMode: boolean;
  zoom: number;
  isDirty: boolean;
  saving: boolean;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onOpenSettings: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export const GridControls = memo(function GridControls({
  gardenName,
  hasGrid,
  shapeEditMode,
  zoom,
  isDirty,
  saving,
  onSelectAll,
  onDeselectAll,
  onZoomIn,
  onZoomOut,
  onOpenSettings,
  onCancel,
  onSave,
}: GridControlsProps) {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 2,
        mb: 2,
      }}
    >
      <Typography
        variant="h5"
        fontWeight={700}
        color="primary"
        sx={{ mr: 'auto' }}
      >
        {gardenName || t('planner.title')}
      </Typography>

      {shapeEditMode && hasGrid && (
        <>
          <Button variant="outlined" size="small" onClick={onSelectAll}>
            {t('planner.shape.selectAll')}
          </Button>
          <Button variant="outlined" size="small" onClick={onDeselectAll}>
            {t('planner.shape.deselectAll')}
          </Button>
        </>
      )}

      {hasGrid && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
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
      )}

      {hasGrid && (
        <Button
          variant="outlined"
          size="small"
          startIcon={<SettingsIcon />}
          onClick={onOpenSettings}
        >
          {t('planner.toolbar.settings')}
        </Button>
      )}

      {isDirty && (
        <Button
          variant="outlined"
          size="small"
          color="inherit"
          onClick={onCancel}
          disabled={saving}
        >
          {t('planner.toolbar.cancel')}
        </Button>
      )}

      <Button
        variant="contained"
        startIcon={
          saving ? (
            <CircularProgress size={18} color="inherit" />
          ) : (
            <SaveIcon />
          )
        }
        disabled={!isDirty || saving}
        onClick={onSave}
      >
        {saving ? t('planner.toolbar.saving') : t('planner.toolbar.save')}
      </Button>
    </Box>
  );
});
