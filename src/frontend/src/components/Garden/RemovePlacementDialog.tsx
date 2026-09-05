import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { cellRef } from '../../pages/gardenPlanner/placementGeometry';

interface Props {
  open: boolean;
  /** Display name of the placed plant (the panel's own resolver output). */
  plantName: string;
  /** Anchor + footprint of the placement, 0-based like PlannerPlacement. */
  startRow: number;
  startCol: number;
  spanRows: number;
  spanCols: number;
  /** Escape, backdrop click and the Cancel button all land here. */
  onCancel: () => void;
  /** The Remove button and Enter land here — the caller owns the dispatch. */
  onConfirm: () => void;
}

/**
 * SMA-18 lot 1: confirmation before "Retirer du plan". Structure follows
 * DeleteAccountDialog (self-contained MUI Dialog, aria wiring on the title);
 * the pale error disc follows AdminStateCard. The dialog owns NO planner
 * state: it only asks, and the page dispatches the unchanged REMOVE_PLACEMENT.
 *
 * Initial focus lands on Cancel (the first `autoFocus` on a dialog button in
 * the app — the safe default for a destructive confirm). Enter still means
 * Remove (mockup keyboard grammar), so the Dialog intercepts it before the
 * focused Cancel button can act on it.
 */
export default function RemovePlacementDialog({
  open,
  plantName,
  startRow,
  startCol,
  spanRows,
  spanCols,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const descriptionId = useId();

  // "F3" for a single cell, "F3–G4" (first to last cell) for a footprint.
  const from = cellRef(startRow, startCol);
  const to = cellRef(startRow + spanRows - 1, startCol + spanCols - 1);
  const cells =
    from === to
      ? from
      : t('planner.removePlacementDialog.cellRange', { from, to });

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      onKeyDown={(e) => {
        // A held Enter must not open-and-confirm in one press: the panel's
        // button opens on the first keypress, and the auto-repeat that
        // follows would otherwise land here (repeat = no deliberate act).
        if (e.key === 'Enter' && !e.repeat) {
          e.preventDefault();
          onConfirm();
        }
      }}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      maxWidth="xs"
      fullWidth
      disableScrollLock
    >
      <DialogTitle
        id={titleId}
        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700 }}
      >
        <Box
          aria-hidden
          sx={{
            width: 40,
            height: 40,
            flexShrink: 0,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: (theme) => alpha(theme.palette.error.main, 0.12),
            color: 'error.main',
          }}
        >
          <DeleteOutlineIcon />
        </Box>
        {t('planner.removePlacementDialog.title')}
      </DialogTitle>
      <DialogContent>
        <Typography id={descriptionId} variant="body2">
          {t('planner.removePlacementDialog.body', {
            plant: plantName,
            w: spanCols,
            h: spanRows,
            cells,
          })}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="outlined" onClick={onCancel} autoFocus>
          {t('planner.removePlacementDialog.cancel')}
        </Button>
        <Button
          variant="contained"
          color="error"
          startIcon={<DeleteOutlineIcon />}
          onClick={onConfirm}
        >
          {t('planner.removePlacementDialog.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
