import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { updateGarden } from '../../services/gardenApi';
import type { DashboardGardenData } from '../../types/DashboardData';

interface Props {
  /**
   * The garden being renamed; null closes the dialog. The garden OUTLIVES
   * the closing (the DeleteGardenDialog idiom): the fading dialog keeps its
   * title and what was typed instead of collapsing mid-transition.
   */
  garden: DashboardGardenData | null;
  /** Escape, backdrop click and Cancel — refused while the request runs. */
  onClose: () => void;
  /** Fired once the backend confirmed the rename: the caller re-fetches. */
  onRenamed: () => void;
}

/**
 * SMA-448, lot F2 — the rename dialog of a garden, shared by the Gardens
 * widget and the Novice page. It was the widget's own (SMA-336 PR 2/5, moved
 * there from « Mes Jardins » with its aria-labels and its four review rounds);
 * a second surface drawing the same dialog is what makes it a component of
 * its own — the same dialog by construction, like `DeleteGardenDialog`
 * beside it. It owns the API call, so the pending and error states live in
 * one place: a failure keeps it open with the typed values intact for a retry.
 */
export default function RenameGardenDialog({ garden, onClose, onRenamed }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  // The fields take the garden's own values on the OPENING edge — a garden
  // where there was none, or another garden — and a stale error goes with
  // them. A render-time adjust, as in `DeleteGardenDialog`
  // (react-hooks/set-state-in-effect forbids the effect variant); keyed on the
  // edge, so the closing fade keeps what was typed.
  const [prevGarden, setPrevGarden] = useState(garden);
  if (garden !== prevGarden) {
    setPrevGarden(garden);
    if (garden) {
      setName(garden.name);
      setDescription(garden.description ?? '');
      setError(false);
    }
  }

  /**
   * EVERY way the dialog closes (SMA-336 round 1, E9 / G4). Clearing the
   * error here is the point: it is raised inside a modal, so leaving it
   * behind put a failure message on the widget frame with no subject left to
   * explain it. Not while the rename is in flight (round 2, E'5 / N2): the
   * Save button is disabled, but the backdrop and Escape still reach this
   * handler, and closing there would unmount the Dialog the error Alert lives
   * in, so a rename that then fails is reported nowhere at all.
   */
  const handleClose = () => {
    if (saving) return;
    setError(false);
    onClose();
  };

  const handleSave = async () => {
    if (!garden || saving) return;
    setSaving(true);
    setError(false);
    try {
      await updateGarden(garden.id, name, description || undefined);
      onClose();
      onRenamed();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={garden !== null} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('gardens.editDialogTitle')}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {t('gardens.mutationError')}
          </Alert>
        )}
        <TextField
          label={t('gardens.gardenName')}
          fullWidth
          required
          slotProps={{ htmlInput: { maxLength: 100 } }}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={saving}
          sx={{ mt: 1, mb: 2 }}
        />
        <TextField
          label={t('gardens.description')}
          fullWidth
          multiline
          rows={3}
          slotProps={{ htmlInput: { maxLength: 500 } }}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={saving}
        />
      </DialogContent>
      <DialogActions>
        {/* Round 3 (N'1): while `handleClose` refuses to close, the dialog
            has to SAY that it is working. Cancel disabled, the fields
            disabled and a spinner on Save — the same pending shape as
            DeleteGardenDialog, so the two dialogs read alike.

            Round 4 (E'''2): all of that is SILENT. The spinner is
            `aria-hidden` and `aria-busy` sits on a disabled button, which
            assistive technology does not announce — so a screen-reader user
            met a dialog that refused to close and said nothing. This region
            is what speaks. It stays MOUNTED and empty when idle: a live
            region inserted at the same moment as its text is announced
            unreliably, one that is already there is not. */}
        <Typography
          role="status"
          aria-live="polite"
          variant="body2"
          color="text.secondary"
          sx={{ mr: 'auto', pl: 1 }}
        >
          {saving ? t('gardens.savingStatus') : ''}
        </Typography>
        <Button onClick={handleClose} disabled={saving}>
          {t('gardens.cancel')}
        </Button>
        <Button
          variant="contained"
          disabled={saving || !name.trim()}
          aria-busy={saving}
          startIcon={
            saving ? <CircularProgress size={18} color="inherit" aria-hidden="true" /> : undefined
          }
          onClick={handleSave}
        >
          {t('gardens.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
