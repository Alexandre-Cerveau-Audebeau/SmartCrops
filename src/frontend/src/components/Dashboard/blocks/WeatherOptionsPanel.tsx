import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import { DASHBOARD_TYPE } from '../../../theme/dashboardTokens';

interface Props {
  /** The place the profile default points at, when the aggregate can name it; null otherwise. */
  current: string | null;
  /**
   * Whether the account CARRIES a default at all (round 2, D5 — Extension
   * cdfbd4df / GitHub 4009200274): when every garden overrides it, the
   * aggregate cannot name it and `current` is null, yet « Aucun lieu enregistré »
   * would be false — the panel then says what the dialog says, « Un lieu par
   * défaut est enregistré ».
   */
  located: boolean;
  /** Opens the shared location dialog on the profile default. */
  onLocate: () => void;
}

/**
 * SMA-336 PR 3b/5, round 1 (V21 a) — the Weather widget's entry in the
 * Edit-mode gear: « Localisation… », which opens the shared `LocationDialog`
 * on the profile default — where the current place is stated, another can be
 * picked with « Utiliser », and « Retirer » drops it. PR 3b/5 had shipped
 * three doors to ADD a location and none to change or remove one.
 *
 * One option row on the geometry of `A8Options.dc.html`'s `.pop-r` — `display:
 * flex; align-items: center; gap: 14px; height: 48px`, a 22 px glyph — the
 * same row the Counters panel draws, so the eight gears open on one shape.
 */
export default function WeatherOptionsPanel({ current, located, onLocate }: Props) {
  const { t } = useTranslation();

  // The three states of the dialog's own line (`LocationDialog`, V21), in the
  // same order: named, stored but unnamed, none.
  const currentLine = current
    ? t('dashboard.location.current', { place: current })
    : located
      ? t('dashboard.location.currentUnknown')
      : t('dashboard.location.currentNone');

  return (
    <Box
      data-weather-options
      sx={{ display: 'flex', alignItems: 'center', gap: '14px', minHeight: 48 }}
    >
      <Box
        aria-hidden
        sx={{ display: 'flex', flexShrink: 0, color: 'text.secondary', '& > svg': { fontSize: 22 } }}
      >
        <LocationOnOutlinedIcon />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 15 }}>{t('dashboard.blocks.weather.options.hint')}</Typography>
        <Typography sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary' }}>
          {currentLine}
        </Typography>
      </Box>
      <Button variant="outlined" size="small" onClick={onLocate} sx={{ flexShrink: 0 }}>
        {t('dashboard.blocks.weather.options.location')}
      </Button>
    </Box>
  );
}
