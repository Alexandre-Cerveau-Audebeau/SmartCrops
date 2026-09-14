import Box from '@mui/material/Box';
import { DASHBOARD_WEATHER } from '../../../theme/dashboardTokens';
import { useDashboardTokens } from '../../../theme/useDashboardTokens';
import type { WeatherDay } from '../../../types/DashboardWeather';
import { barMasks } from './weatherTime';

interface Props {
  day: WeatherDay;
  /** The WEEK's scale — the same for every bar of the card. */
  scale: { min: number; max: number };
}

/**
 * `.hbar` of `A5MeteoTailles.dc.html` (l. 236-237): an 8 px bar, radius 4,
 * filled edge to edge with the `--temp-cold → --temp-warm` gradient, over which
 * two `--track` masks hide everything outside the day's own min–max — so the
 * gradient is the week's and the visible span is the day's, on one scale.
 * Decorative: the two temperatures beside it carry the figures.
 */
export default function WeatherBar({ day, scale }: Props) {
  const tk = useDashboardTokens();
  const masks = barMasks(day, scale);

  return (
    <Box
      aria-hidden
      data-weather-bar
      sx={{
        position: 'relative',
        flex: 1,
        minWidth: 0,
        height: DASHBOARD_WEATHER.bar,
        borderRadius: `${DASHBOARD_WEATHER.bar / 2}px`,
        background: `linear-gradient(90deg, ${tk.tempCold}, ${tk.tempWarm})`,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: `${masks.left}%`,
          backgroundColor: tk.track,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: `${masks.right}%`,
          backgroundColor: tk.track,
        }}
      />
    </Box>
  );
}
