import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import { DASHBOARD_WEATHER } from '../../../theme/dashboardTokens';

interface Props {
  name: string;
  /** Pushed to the right of the line — the « 1/3 localisé » chip (A4, `margin-left: auto`). */
  trailing?: ReactNode;
  /**
   * Makes the name a BUTTON that opens the location dialog (round 1, V21 b):
   * a discreet link — the name in its own type, a dotted underline — and a
   * keyboard target. Without it the name is plain text.
   */
  onEdit?: () => void;
  /** The button's accessible name: the place AND the gesture, « Écully — modifier la localisation ». */
  editLabel?: string;
}

/** The name's type, shared by the text and the button forms. */
const nameSx = {
  // A flex item's automatic minimum is its content width (round 1, G6):
  // without this the name never shrank, the ellipsis never engaged, and a
  // long stored name pushed the « 1/3 localisé » chip — a button — past the
  // 160 / 200 px hero column, where the card's `overflow: hidden` clipped it
  // out of reach.
  minWidth: 0,
  fontSize: DASHBOARD_WEATHER.place,
  fontWeight: 700,
  color: 'text.secondary',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

/**
 * `.wx-place` of `A5MeteoTailles.dc.html` (l. 224): `display: flex;
 * align-items: center; gap: 7px; font-size: 14px; font-weight: 700`, a 17 px
 * `LocationOnOutlined` pin before the stored place name. It is the widget's
 * TITLE — the one card of the dashboard without a `.hd` row (`_spec.md:108`,
 * arbitrage Q1) — and the same line in all of its states.
 */
export default function WeatherPlace({ name, trailing, onEdit, editLabel }: Props) {
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
      {onEdit ? (
        <Box
          component="button"
          type="button"
          data-weather-place-edit
          onClick={onEdit}
          aria-label={editLabel ?? name}
          sx={{
            ...nameSx,
            // A button reset to the line's own type: no fill, no border, the
            // inherited font; the dotted underline is what says « this opens
            // something » without a link colour the title never had.
            display: 'block',
            background: 'none',
            border: 0,
            p: 0,
            m: 0,
            font: 'inherit',
            fontSize: DASHBOARD_WEATHER.place,
            fontWeight: 700,
            lineHeight: 'inherit',
            textAlign: 'left',
            cursor: 'pointer',
            textDecoration: 'underline dotted',
            textDecorationColor: 'currentColor',
            textUnderlineOffset: '3px',
            borderRadius: '4px',
            '&:hover': { color: 'text.primary' },
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          }}
        >
          {name}
        </Box>
      ) : (
        <Typography component="span" sx={nameSx}>
          {name}
        </Typography>
      )}
      {trailing && <Box sx={{ ml: 'auto', flexShrink: 0 }}>{trailing}</Box>}
    </Box>
  );
}
