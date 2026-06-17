import { useTranslation } from 'react-i18next';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useUnitSystem } from '../../hooks/useUnitSystem';
import type { UnitSystem } from '../../contexts/unitSystemContextValue';
import { NAV_BG } from '../../constants/colors';

/**
 * Europe (metric) / US (imperial) segmented switch for Plant Detail v2 (SMA-178).
 * Reads and writes the shared {@link useUnitSystem} preference; the active
 * segment uses the brand green. Sits above the table of contents in the left
 * sidebar. Ignores a null `next` so clicking the already-active segment never
 * clears the selection.
 */
export default function UnitSystemToggle() {
  const { t } = useTranslation();
  const { system, setSystem } = useUnitSystem();

  return (
    <ToggleButtonGroup
      value={system}
      exclusive
      size="small"
      onChange={(_, next: UnitSystem | null) => {
        if (next) setSystem(next);
      }}
      aria-label={t('plantDetail.units.label')}
      sx={{
        width: '100%',
        mb: 1.5,
        '& .MuiToggleButton-root': {
          flex: 1,
          textTransform: 'none',
          fontWeight: 600,
          fontSize: 13.5,
          color: '#4a564d',
          borderColor: '#d8e0d6',
          py: 0.6,
        },
        '& .MuiToggleButton-root.Mui-selected': {
          bgcolor: NAV_BG,
          color: '#fff',
          '&:hover': { bgcolor: NAV_BG },
        },
      }}
    >
      <ToggleButton value="metric">
        {t('plantDetail.units.metric')}
      </ToggleButton>
      <ToggleButton value="imperial">
        {t('plantDetail.units.imperial')}
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
