import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import LocationField from './LocationField';
import {
  locationLabel,
  removeProfileLocation,
  revertToProfile,
  writeLocation,
  type LocationTarget,
} from './locationTools';
import { DASHBOARD_TYPE } from '../../theme/dashboardTokens';
import type { LocationPick } from '../../types/DashboardWeather';

interface Props {
  open: boolean;
  /** What the dialog writes to; kept by the caller while the dialog fades out. */
  target: LocationTarget | null;
  onClose: () => void;
  /** The server answered 204 — the caller re-fetches the weather. */
  onSaved: () => void;
}

/**
 * SMA-336 PR 3b/5 — the ONE location dialog of the dashboard (pre-flight
 * § F.4): opened by the Gardens table's « Ajouter » on a garden, by the
 * « 1/3 localisé » chip and by the Small card's « Ajouter une ville » for the
 * profile default. Title « Localiser <jardin> » or « Localiser mes jardins »,
 * the search field, a preview of the picked place, « Utiliser », « Annuler »,
 * and — for a garden that carries its own override while the profile has a
 * default — « Revenir à la ville du profil ».
 *
 * Its error contract is `GardenConfigDialog`'s (l. 50-55): a failed write is
 * reported INLINE and the dialog STAYS OPEN with the pick intact, so a retry is
 * one click; every close path is refused while a write is in flight, because
 * the Alert the failure would land in lives inside the dialog.
 *
 * Since round 1 (V21) it is also the ONE door to CHANGE or REMOVE a location:
 * it states the place the target currently holds — « Lieu actuel : Écully » —
 * before the field, and a profile target that holds one offers « Retirer »
 * (`DELETE /api/auth/profile/location`, then the caller re-fetches).
 */
export default function LocationDialog({ open, target, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [pick, setPick] = useState<LocationPick | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const reset = () => {
    setPick(null);
    setInputValue('');
    setSaveError(false);
  };

  /** EVERY way the dialog closes — never while a write is in flight. */
  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const run = async (write: () => Promise<void>) => {
    if (!target || saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      await write();
      reset();
      onSaved();
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const title =
    target?.kind === 'garden'
      ? t('dashboard.location.titleGarden', { name: target.gardenName })
      : t('dashboard.location.titleProfile');

  // What the target holds TODAY, said before anything is changed (V21).
  const canRemove = target?.kind === 'profile' && target.canRemove === true;
  const currentLine = target?.current
    ? t('dashboard.location.current', { place: target.current })
    : canRemove
      ? t('dashboard.location.currentUnknown')
      : t('dashboard.location.currentNone');

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {saveError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {t('dashboard.location.saveError')}
          </Alert>
        )}
        <Typography
          data-location-current
          sx={{ mb: 2, fontSize: DASHBOARD_TYPE.body, color: 'text.secondary' }}
        >
          {currentLine}
        </Typography>
        <LocationField
          value={pick}
          onChange={setPick}
          inputValue={inputValue}
          onInputChange={setInputValue}
          disabled={saving}
          autoFocus
        />
        {/* The preview of the choice, « Lyon, Auvergne-Rhône-Alpes, France »:
            what « Utiliser » will store, said before it is stored. */}
        <Typography
          sx={{
            mt: 1.5,
            fontSize: DASHBOARD_TYPE.secondary,
            color: 'text.secondary',
            minHeight: 20,
          }}
        >
          {pick ? t('dashboard.location.selected', { place: locationLabel(pick) }) : ''}
        </Typography>
      </DialogContent>
      <DialogActions>
        {/* Always mounted live region, like the page's create dialog: the
            status is announced when it appears, and the space never jumps. */}
        <Typography
          role="status"
          aria-live="polite"
          variant="body2"
          color="text.secondary"
          sx={{ mr: 'auto', pl: 1 }}
        >
          {saving ? t('dashboard.location.saving') : ''}
        </Typography>
        {target?.kind === 'garden' && target.canRevert && (
          <Button onClick={() => run(() => revertToProfile(target))} disabled={saving}>
            {t('dashboard.location.revert')}
          </Button>
        )}
        {canRemove && (
          <Button onClick={() => run(removeProfileLocation)} disabled={saving}>
            {t('dashboard.location.remove')}
          </Button>
        )}
        <Button onClick={close} disabled={saving}>
          {t('dashboard.location.cancel')}
        </Button>
        <Button
          variant="contained"
          disabled={saving || pick === null}
          aria-busy={saving}
          startIcon={
            saving ? <CircularProgress size={18} color="inherit" aria-hidden="true" /> : undefined
          }
          onClick={() => {
            if (pick) void run(() => writeLocation(target!, pick));
          }}
        >
          {t('dashboard.location.use')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
