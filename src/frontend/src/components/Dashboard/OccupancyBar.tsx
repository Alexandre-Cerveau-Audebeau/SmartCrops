import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DASHBOARD_TYPE } from '../../theme/dashboardTokens';
import { formatCount } from '../../utils/formatNumber';

interface Props {
  percent: number;
}

/**
 * SMA-336 PR 2/5 — the occupancy bar of the Gardens table and the Statistics
 * rows: a track, a fill, and the figure beside it.
 *
 * The number is written out, not left to the bar. A bar alone states a
 * proportion by length only, which neither a screen reader nor a
 * colour-blind reader can take — and the frozen design prints the percentage
 * next to it for exactly that reason.
 */
export default function OccupancyBar({ percent }: Props) {
  const { i18n } = useTranslation();
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <Box
        aria-hidden
        sx={{
          flex: 1,
          minWidth: 28,
          maxWidth: 64,
          height: 6,
          borderRadius: 3,
          backgroundColor: 'action.hover',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: `${clamped}%`,
            height: '100%',
            backgroundColor: 'primary.main',
          }}
        />
      </Box>
      <Typography
        component="span"
        sx={{ fontSize: DASHBOARD_TYPE.body, fontWeight: 700 }}
      >
        {/* Locale-formatted, like every other figure of the three widgets
            (round 1, G5) — the percentage is whole, but the rule is that no
            number reaches the screen through raw concatenation. */}
        {`${formatCount(clamped, i18n.language)} %`}
      </Typography>
    </Box>
  );
}
