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
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';

interface Props {
  open: boolean;
  /** Escape, backdrop click and « Rester » all land here: nothing moves. */
  onStay: () => void;
  /** « Quitter sans enregistrer »: the caller navigates, and the draft is lost. */
  onLeave: () => void;
}

/**
 * SMA-437, review of the v3, M9 — the question asked before a door leaves the
 * planner with UNSAVED changes. « Voir les formules », in the toast of a plan
 * the formula refused (R3-E1, L4), led to Mes Jardins at once and threw the
 * draft away — placements included — without a word: the planner keeps no
 * draft outside its state, and the client has no navigation guard. The
 * structure follows `RemovePlacementDialog` (a self-contained MUI Dialog,
 * the aria wiring on the title and the body) in the warning tone of the
 * unsaved-changes bar whose state (`isDirty`, SMA-309) decides whether it
 * is asked at all. The dialog owns NO planner state: it asks, and the page
 * keeps or leaves.
 *
 * Initial focus lands on « Rester », the safe default; Enter confirms nothing
 * from the body — losing a draft is not a gesture to auto-repeat into. It
 * names no door: it serves any that leaves with unsaved changes.
 */
export default function LeaveUnsavedDialog({ open, onStay, onLeave }: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Dialog
      open={open}
      onClose={onStay}
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
            bgcolor: (theme) => alpha(theme.palette.warning.main, 0.12),
            color: 'warning.main',
          }}
        >
          <WarningAmberOutlinedIcon />
        </Box>
        {t('planner.leaveDialog.title')}
      </DialogTitle>
      <DialogContent>
        <Typography id={descriptionId} variant="body2">
          {t('planner.leaveDialog.body')}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="outlined" onClick={onStay} autoFocus>
          {t('planner.leaveDialog.stay')}
        </Button>
        <Button variant="contained" color="warning" onClick={onLeave}>
          {t('planner.leaveDialog.leave')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
