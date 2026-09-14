import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import { DASHBOARD_WEATHER } from '../../../theme/dashboardTokens';

interface Props {
  name: string;
  /** Pushed to the right of the line — the « 1/3 localisé » chip (A4, `margin-left: auto`). */
  trailing?: ReactNode;
}

/**
 * `.wx-place` of `A5MeteoTailles.dc.html` (l. 224): `display: flex;
 * align-items: center; gap: 7px; font-size: 14px; font-weight: 700`, a 17 px
 * `LocationOnOutlined` pin before the stored place name. It is the widget's
 * TITLE — the one card of the dashboard without a `.hd` row (`_spec.md:108`,
 * arbitrage Q1) — and the same line in all of its states.
 */
export default function WeatherPlace({ name, trailing }: Props) {
  return (
    <Box
      data-weather-place
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: `${DASHBOARD_WEATHER.placeGap}px`,
        minWidth: 0,
      }}
    >
      <LocationOnOutlinedIcon
        aria-hidden
        sx={{ fontSize: DASHBOARD_WEATHER.placeIcon, color: 'text.secondary', flexShrink: 0 }}
      />
      <Typography
        component="span"
        sx={{
          // A flex item's automatic minimum is its content width (round 1,
          // G6): without this the name never shrank, the ellipsis never
          // engaged, and a long stored name pushed the « 1/3 localisé » chip —
          // a button — past the 160 / 200 px hero column, where the card's
          // `overflow: hidden` clipped it out of reach.
          minWidth: 0,
          fontSize: DASHBOARD_WEATHER.place,
          fontWeight: 700,
          color: 'text.secondary',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {name}
      </Typography>
      {trailing && <Box sx={{ ml: 'auto', flexShrink: 0 }}>{trailing}</Box>}
    </Box>
  );
}
