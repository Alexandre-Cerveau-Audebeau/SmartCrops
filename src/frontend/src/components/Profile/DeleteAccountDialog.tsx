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
import { deleteAccount } from '../../services/profileApi';

interface Props {
  open: boolean;
  /** The account's email address — the value the user must TYPE to arm the
   * destructive submit (SMA-341 product ruling: typing, not password re-proof,
   * because Google-only accounts have no password). */
  email: string;
  onClose: () => void;
  /** Fired after the backend confirmed the deletion — the parent clears the
   * client session and leaves the page. */
  onDeleted: () => void;
}

/**
 * SMA-341: confirmation dialog for account deletion (GDPR art. 17). This is the
 * FIRST confirmation dialog in the app — deliberately self-contained rather
 * than a shared abstraction built on a sample of one (SMA-18 owns the planner's
 * future confirmation needs and can generalize from here if patterns converge).
 * The submit stays disabled until the typed value matches the account email
 * (trimmed, case-insensitive — the brake is the act of typing).
 */
export default function DeleteAccountDialog({ open, email, onClose, onDeleted }: Props) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  // null = no error; '' = failed without a usable detail (generic copy shown);
  // non-empty = the backend's own reason, surfaced verbatim (the changePassword
  // precedent — the API layer already extracts it).
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase();

  const handleClose = () => {
    if (deleting) return;
    setTyped('');
    setError(null);
    onClose();
  };

  const handleConfirm = async () => {
    setError(null);
    setDeleting(true);
    try {
      await deleteAccount(typed.trim());
      // Deliberately not awaited: the parent's onDeleted (Profile.handleDeleted)
      // guarantees it cannot reject — logout failures are swallowed at the
      // source and navigation always runs — so no catch is needed here.
      onDeleted();
    } catch (err) {
      // Keep the dialog open with the typed value intact so a transient
      // failure can be retried without re-arming from scratch.
      setError(err instanceof Error ? err.message : '');
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="delete-account-dialog-title"
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle id="delete-account-dialog-title">
        {t('profile.deleteDialogTitle')}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="body2">{t('profile.deleteDialogWarning')}</Typography>
        <Typography variant="body2" fontWeight={600}>
          {t('profile.deleteDialogIrreversible')}
        </Typography>
        {error !== null && (
          <Alert severity="error">{error || t('profile.deleteError')}</Alert>
        )}
        <Typography variant="body2">
          {t('profile.deleteDialogPrompt', { email })}
        </Typography>
        <TextField
          label={t('profile.deleteDialogConfirmLabel')}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          fullWidth
          autoComplete="off"
          disabled={deleting}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={deleting}>
          {t('profile.deleteDialogCancel')}
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleConfirm}
          disabled={!matches || deleting}
          startIcon={deleting ? <CircularProgress size={18} color="inherit" aria-hidden="true" /> : undefined}
        >
          {t('profile.deleteDialogConfirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
