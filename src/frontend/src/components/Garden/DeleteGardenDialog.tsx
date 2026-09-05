import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { deleteGarden } from '../../services/gardenApi';

/**
 * What the dialog can say about the consequences, per caller:
 * - `planner`: the draft the user is looking at (placements + infrastructure
 *   BLOCKS, i.e. groupInfrastructureRegions, never painted cells);
 * - `list`: "Mes Jardins" only knows the DISTINCT placed plants (the list DTO
 *   carries neither placements nor infrastructures — no extra request);
 * - `unknown`: no grid loaded yet — the body names no count at all.
 */
export type DeleteGardenSummary =
  | { kind: 'planner'; placements: number; infrastructures: number }
  | { kind: 'list'; plants: number }
  | { kind: 'unknown' };

interface Props {
  open: boolean;
  gardenId: string;
  /** The name the user must TYPE to arm the destructive submit. */
  gardenName: string;
  summary: DeleteGardenSummary;
  /** Escape, backdrop click and Cancel — refused while the request runs. */
  onClose: () => void;
  /** Fired once the backend confirmed the deletion. */
  onDeleted: () => void;
}

// Mockup width (~560px), narrower than MUI's sm paper (600px).
const PAPER_MAX_WIDTH_PX = 560;

/**
 * SMA-18 lot 1: type-the-name confirmation before deleting a garden — the
 * DeleteAccountDialog brake (SMA-341) applied to gardens, reused from BOTH
 * the "Mes Jardins" card and the planner's settings Danger zone. The dialog
 * owns the API call so the pending/error states live in one place: a failure
 * keeps it open with the typed value intact for a retry.
 */
export default function DeleteGardenDialog({
  open,
  gardenId,
  gardenName,
  summary,
  onClose,
  onDeleted,
}: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);

  // Same rule as the account brake (DeleteAccountDialog): trimmed and
  // case-insensitive — the brake is the act of typing. An empty target never
  // arms it ('' === '' must not count).
  const matches =
    gardenName.trim() !== '' &&
    typed.trim().toLowerCase() === gardenName.trim().toLowerCase();

  const handleClose = () => {
    if (deleting) return;
    setTyped('');
    setError(false);
    onClose();
  };

  const handleConfirm = async () => {
    if (!matches || deleting) return;
    setError(false);
    setDeleting(true);
    try {
      await deleteGarden(gardenId);
      setTyped('');
      setDeleting(false);
      onDeleted();
    } catch {
      setError(true);
      setDeleting(false);
    }
  };

  const body =
    summary.kind === 'planner'
      ? t('gardens.deleteDialog.bodyPlanner', {
          name: gardenName,
          placements: t('gardens.deleteDialog.placementsCount', {
            count: summary.placements,
          }),
          infrastructures: t('gardens.deleteDialog.infrastructuresCount', {
            count: summary.infrastructures,
          }),
        })
      : summary.kind === 'list'
        ? t('gardens.deleteDialog.bodyList', {
            name: gardenName,
            count: summary.plants,
          })
        : t('gardens.deleteDialog.bodyNoCounts', { name: gardenName });

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      onKeyDown={(e) => {
        // Enter deletes ONLY once the typed name arms the button — and only
        // from the text field. A focused button keeps its own native Enter
        // activation (Cancel cancels, the armed Delete deletes): the action
        // is irreversible, so Enter on "Annuler" must never delete.
        if (e.key !== 'Enter' || e.repeat || !matches || deleting) return;
        if ((e.target as HTMLElement).closest('button')) return;
        e.preventDefault();
        void handleConfirm();
      }}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      maxWidth="sm"
      fullWidth
      disableScrollLock
      slotProps={{ paper: { sx: { maxWidth: PAPER_MAX_WIDTH_PX } } }}
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
          <WarningAmberOutlinedIcon />
        </Box>
        {t('gardens.deleteDialog.title')}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box id={descriptionId}>
          <Typography variant="body2">{body}</Typography>
          <Typography variant="body2" fontWeight={600}>
            {t('gardens.deleteDialog.irreversible')}
          </Typography>
        </Box>
        {error && (
          <Alert severity="error">{t('gardens.deleteDialog.error')}</Alert>
        )}
        <Box>
          <Typography
            component="label"
            htmlFor={inputId}
            variant="body2"
            sx={{ display: 'block', mb: 1 }}
          >
            {t('gardens.deleteDialog.confirmLabel')}
          </Typography>
          <TextField
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={gardenName}
            fullWidth
            size="small"
            autoComplete="off"
            disabled={deleting}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="outlined" onClick={handleClose} disabled={deleting}>
          {t('gardens.deleteDialog.cancel')}
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleConfirm}
          disabled={!matches || deleting}
          startIcon={
            deleting ? (
              <CircularProgress size={18} color="inherit" aria-hidden="true" />
            ) : (
              <DeleteOutlineIcon />
            )
          }
        >
          {t('gardens.deleteDialog.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
