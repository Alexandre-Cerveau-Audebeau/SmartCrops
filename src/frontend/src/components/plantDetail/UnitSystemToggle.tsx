import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import StraightenIcon from '@mui/icons-material/Straighten';
import { useUnitSystem } from '../../hooks/useUnitSystem';
import type { UnitSystem } from '../../contexts/unitSystemContextValue';
import { NAV_BG } from '../../constants/colors';

/**
 * Europe (metric) / US (imperial) switch for Plant Detail v2 (SMA-178), styled
 * to the design: its own white card with a "UNITS" header + ruler icon, and an
 * iOS-style segmented control (light track, the active option a raised white
 * pill — NOT a green fill). Each segment is two centred lines: the name, then
 * the unit triplet in smaller grey. Reads/writes the shared {@link useUnitSystem}
 * preference; behaviour is unchanged from commit 1. A null `next` (clicking the
 * active segment) is ignored so the selection is never cleared.
 */
export default function UnitSystemToggle() {
  const { t } = useTranslation();
  const { system, setSystem } = useUnitSystem();

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: '1px solid #ECF1EA',
        borderRadius: 3,
        p: 1.5,
        boxShadow: '0 1px 3px rgba(27,94,58,0.06)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
        <StraightenIcon fontSize="small" sx={{ color: 'text.secondary' }} />
        <Typography
          component="div"
          sx={{
            fontSize: 11,
            letterSpacing: '0.07em',
            color: 'text.secondary',
            fontWeight: 500,
            textTransform: 'uppercase',
            lineHeight: 1,
          }}
        >
          {t('plantDetail.units.label')}
        </Typography>
      </Box>

      <ToggleButtonGroup
        value={system}
        exclusive
        fullWidth
        onChange={(_, next: UnitSystem | null) => {
          if (next) setSystem(next);
        }}
        aria-label={t('plantDetail.units.label')}
        sx={{
          width: '100%',
          bgcolor: '#EFF1EC',
          borderRadius: 1.5,
          p: '4px',
          gap: '4px',
          border: 0,
          '& .MuiToggleButtonGroup-grouped': {
            flex: 1,
            m: 0,
            border: 0,
            borderRadius: '8px !important',
            textTransform: 'none',
            py: 0.6,
            px: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            lineHeight: 1.2,
            color: 'text.secondary',
            '& .unit-name': { fontSize: 13.5, fontWeight: 500 },
            '& .unit-triplet': { fontSize: 11, color: 'text.secondary' },
            '&:hover': { bgcolor: 'transparent' },
            '&.Mui-selected': {
              bgcolor: '#fff',
              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
              '&:hover': { bgcolor: '#fff' },
              '& .unit-name': { color: NAV_BG, fontWeight: 700 },
            },
          },
        }}
      >
        <ToggleButton value="metric" aria-label={t('plantDetail.units.metric')}>
          <Box component="span" className="unit-name">
            {t('plantDetail.units.metric')}
          </Box>
          <Box component="span" className="unit-triplet" aria-hidden="true">
            {t('plantDetail.units.metricUnits')}
          </Box>
        </ToggleButton>
        <ToggleButton
          value="imperial"
          aria-label={t('plantDetail.units.imperial')}
        >
          <Box component="span" className="unit-name">
            {t('plantDetail.units.imperial')}
          </Box>
          <Box component="span" className="unit-triplet" aria-hidden="true">
            {t('plantDetail.units.imperialUnits')}
          </Box>
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}
