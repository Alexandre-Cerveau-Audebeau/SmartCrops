import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { visuallyHidden } from '@mui/utils';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import InviteState from '../InviteState';
import LocationField from '../LocationField';
import { writeLocation } from '../locationTools';
import { nameList } from './weatherFormat';
import { useProfileCity } from '../../../hooks/useProfileCity';
import { DASHBOARD_TYPE } from '../../../theme/dashboardTokens';
import { useDashboardTokens } from '../../../theme/useDashboardTokens';
import type { LocationPick } from '../../../types/DashboardWeather';

interface Props {
  /**
   * `full` — no garden is located (`_spec.md:126-130`): the long sentence, the
   * field, « Utiliser », the profile-city link and the long note.
   * `partial` — some are (A4, `_spec.md:131-135`): the names of the unlocated
   * gardens, the short note, the field and « Utiliser ».
   */
  variant: 'full' | 'partial';
  /** Names of the gardens without a location, for the partial sentence. */
  missing: string[];
  /** Every garden of the account, for « pour vos 3 jardins ». */
  total: number;
  /** The profile default was written (204) — the caller re-fetches. */
  onSaved: () => void;
}

/**
 * SMA-336 PR 3b/5 — the weather card's OWN invitation, with the field in it
 * (pre-flight § F.4). Both forms write the PROFILE DEFAULT: « une seule ville
 * suffit pour tous vos jardins » is literally what `PUT /api/auth/profile/
 * location` does under ADR-0006 — every garden without an override inherits it
 * — and in the partial state that is exactly the one write that resolves
 * « Balcon sud et Potager du fond n'ont pas de localisation » at once.
 *
 * The « Utiliser la ville de mon profil » link only PRE-FILLS the field with
 * the profile's free-text `City` (Q2): no call until the user picks a result
 * and clicks « Utiliser »; it is drawn only when that city is non-blank, read
 * lazily by `useProfileCity` the first time this invitation renders.
 *
 * The partial panel is the artboard's `.inv` as a COLUMN (A4 l. 330-335:
 * `flex-direction: column; gap: 8px; padding: 12px 14px`), a disc-and-text row
 * over a field-and-button row — `InviteState` draws the disc-and-text row, so
 * the full form reuses it and the partial one transcribes the column.
 */
export default function WeatherInvite({ variant, missing, total, onSaved }: Props) {
  const { t, i18n } = useTranslation();
  const tk = useDashboardTokens();
  const [pick, setPick] = useState<LocationPick | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const profileCity = useProfileCity(variant === 'full');
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * The profile-city link: focus the field FIRST, then write the text — MUI's
   * Autocomplete resets a controlled `inputValue` changed while its input is
   * not focused, so the order is what makes the pre-fill stick. The search
   * then runs on that text like on a typed one, and « Utiliser » stays
   * disabled until a result is picked.
   */
  const prefillFromProfile = () => {
    if (!profileCity) return;
    inputRef.current?.focus();
    setInputValue(profileCity);
  };

  const save = async () => {
    if (!pick || saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      await writeLocation({ kind: 'profile' }, pick);
      setPick(null);
      setInputValue('');
      onSaved();
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const fieldRow = (
    <Box sx={{ display: 'flex', gap: '10px', alignItems: 'center', minWidth: 0 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <LocationField
          value={pick}
          onChange={setPick}
          inputValue={inputValue}
          onInputChange={setInputValue}
          disabled={saving}
          size="small"
          inputRef={inputRef}
        />
      </Box>
      <Button
        variant="contained"
        size="small"
        disabled={saving || pick === null}
        aria-busy={saving}
        startIcon={
          saving ? <CircularProgress size={16} color="inherit" aria-hidden="true" /> : undefined
        }
        onClick={() => void save()}
        sx={{ flexShrink: 0 }}
      >
        {t('dashboard.location.use')}
      </Button>
    </Box>
  );

  // Off-screen through the product's ONE recipe, `visuallyHidden` (round 1,
  // E7 — Extension a4a64059): `fontSize: 0 / height: 0 / overflow: hidden` was
  // a local one, and the shared utility is the one known to keep the text in
  // the accessibility tree.
  const status = (
    <Typography role="status" aria-live="polite" sx={visuallyHidden}>
      {saving ? t('dashboard.location.saving') : ''}
    </Typography>
  );

  const error = saveError && (
    <Alert severity="error" sx={{ py: 0 }}>
      {t('dashboard.location.saveError')}
    </Alert>
  );

  if (variant === 'full') {
    return (
      <InviteState
        icon={<LocationOnOutlinedIcon />}
        message={t('dashboard.blocks.weather.invite')}
        action={
          <Box
            data-weather-invite="full"
            sx={{ display: 'flex', flexDirection: 'column', gap: '8px', mt: '8px' }}
          >
            {fieldRow}
            {error}
            {status}
            {profileCity && (
              <Button
                size="small"
                onClick={prefillFromProfile}
                disabled={saving}
                sx={{ alignSelf: 'flex-start', fontSize: DASHBOARD_TYPE.secondary }}
              >
                {t('dashboard.blocks.weather.useProfileCity')}
              </Button>
            )}
            <Typography
              sx={{ fontSize: DASHBOARD_TYPE.secondary, lineHeight: 1.5, color: 'text.secondary' }}
            >
              {t('dashboard.blocks.weather.inviteNote')}
            </Typography>
          </Box>
        }
      />
    );
  }

  const names = nameList(missing, i18n.language, (count) =>
    t('dashboard.blocks.weather.others', { count })
  );

  return (
    <Box
      data-weather-invite="partial"
      data-invite-panel
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        p: '12px 14px',
        borderRadius: '12px',
        backgroundColor: tk.invBg,
        border: `1.5px dashed ${tk.invBd}`,
      }}
    >
      <Box sx={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <Box
          aria-hidden
          sx={{
            width: 34,
            height: 34,
            flexShrink: 0,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tk.invIcBg,
            color: 'primary.main',
            '& .MuiSvgIcon-root': { fontSize: 18 },
          }}
        >
          <LocationOnOutlinedIcon />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: DASHBOARD_TYPE.body,
              lineHeight: 1.4,
              fontWeight: 700,
              color: 'text.primary',
            }}
          >
            {t('dashboard.blocks.weather.partialTitle', {
              count: missing.length,
              gardens: names,
            })}
          </Typography>
          <Typography
            sx={{
              fontSize: DASHBOARD_TYPE.secondary,
              lineHeight: 1.5,
              color: 'text.secondary',
              mt: '4px',
            }}
          >
            {t('dashboard.blocks.weather.partialNote', { count: total })}
          </Typography>
        </Box>
      </Box>
      {fieldRow}
      {error}
      {status}
    </Box>
  );
}
