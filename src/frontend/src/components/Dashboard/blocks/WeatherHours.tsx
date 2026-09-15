import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import WeatherGlyph from './WeatherGlyph';
import { displayTemperature } from './weatherFormat';
import { hourLabel } from './weatherTime';
import { DASHBOARD_WEATHER } from '../../../theme/dashboardTokens';
import type { UnitSystem } from '../../../contexts/unitSystemContextValue';
import type { WeatherHour } from '../../../types/DashboardWeather';

interface Props {
  /** The six consecutive slots from the place's own hour — `upcomingHours`. */
  hours: WeatherHour[];
  system: UnitSystem;
}

/**
 * The six slots of the Medium and Large heads, `A5MeteoTailles.dc.html`
 * l. 294 / 298: `display: grid; grid-template-columns: repeat(6, minmax(0,
 * 1fr)); gap: 6px; align-items: center`, each `.wx-h` a column « heure 13 px /
 * 700 · icône 28 px · température 16 px / 800 » spread over 92–124 px and
 * centred (`_spec.md` § 10.30 — at 108 px they left 34 px of void above and
 * below; unbounded, their three parts drifted 38 to 61 px apart and no longer
 * read as one slot).
 *
 * The hour is the slot's OWN, in the language's notation (« 13 h », « 1 PM »),
 * from the provider's local text — never the browser's clock.
 */
export default function WeatherHours({ hours, system }: Props) {
  const { t, i18n } = useTranslation();

  return (
    <Box
      component="ul"
      data-weather-hours
      sx={{
        flex: 1,
        minWidth: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
        gap: `${DASHBOARD_WEATHER.hourGap}px`,
        alignItems: 'center',
        listStyle: 'none',
        m: 0,
        p: 0,
      }}
    >
      {hours.map((hour) => (
          <Box
            component="li"
            key={hour.time}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: '100%',
              minHeight: DASHBOARD_WEATHER.hourMinHeight,
              maxHeight: DASHBOARD_WEATHER.hourMaxHeight,
              my: 'auto',
            }}
          >
            <Typography
              component="span"
              sx={{
                fontSize: DASHBOARD_WEATHER.hourLabel,
                fontWeight: 700,
                color: 'text.secondary',
                whiteSpace: 'nowrap',
              }}
            >
              {hourLabel(hour.time, i18n.language) ?? hour.time}
            </Typography>
            <WeatherGlyph code={hour.conditionCode} isDay={hour.isDay} px={DASHBOARD_WEATHER.hourIcon} />
            <Typography
              component="span"
              sx={{
                fontSize: DASHBOARD_WEATHER.hourTemperature,
                fontWeight: 800,
                color: 'text.primary',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {t('dashboard.blocks.weather.degrees', {
                value: displayTemperature(hour.tempC, system),
              })}
            </Typography>
          </Box>
      ))}
    </Box>
  );
}
