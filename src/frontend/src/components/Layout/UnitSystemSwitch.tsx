import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useTranslation } from 'react-i18next';
import { useUnitSystem } from '../../hooks/useUnitSystem';
import type { UnitSystem } from '../../contexts/unitSystemContextValue';
import { NAV_BG } from '../../constants/colors';

/**
 * Compact metric/imperial switch for the global top bar (SMA-247). Two pill
 * segments (°C / °F) wired to the shared UnitSystemContext, styled white-on-green
 * to sit on the navbar's brand-green AppBar. Replaces the per-page Plant Detail
 * toggle so the preference is reachable on every page. Each segment keeps the full
 * unit triplet (°C · cm · L / °F · in · gal) as its accessible name.
 */
export default function UnitSystemSwitch() {
  const { t } = useTranslation();
  const { system, setSystem } = useUnitSystem();

  return (
    <ToggleButtonGroup
      value={system}
      exclusive
      size="small"
      aria-label={t('plantDetail.units.label')}
      onChange={(_, next: UnitSystem | null) => {
        if (next) setSystem(next);
      }}
      sx={{
        bgcolor: 'rgba(255,255,255,0.15)',
        borderRadius: '999px',
        p: '2px',
        '& .MuiToggleButtonGroup-grouped': {
          border: 0,
          borderRadius: '999px !important',
          minWidth: 36,
          px: 1,
          py: 0.25,
          lineHeight: 1.2,
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'none',
          color: 'rgba(255,255,255,0.85)',
          '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' },
          '&.Mui-selected': {
            bgcolor: '#fff',
            color: NAV_BG,
            '&:hover': { bgcolor: '#fff' },
          },
        },
      }}
    >
      <ToggleButton
        value="metric"
        aria-label={t('plantDetail.units.metricUnits')}
      >
        {t('plantDetail.units.celsius')}
      </ToggleButton>
      <ToggleButton
        value="imperial"
        aria-label={t('plantDetail.units.imperialUnits')}
      >
        {t('plantDetail.units.fahrenheit')}
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
