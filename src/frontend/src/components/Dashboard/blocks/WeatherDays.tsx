import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import WeatherBar from './WeatherBar';
import WeatherGlyph from './WeatherGlyph';
import { displayTemperature } from './weatherFormat';
import { weekScale, weekdayShort } from './weatherTime';
import { DASHBOARD_WEATHER } from '../../../theme/dashboardTokens';
import { useDashboardTokens } from '../../../theme/useDashboardTokens';
import type { UnitSystem } from '../../../contexts/unitSystemContextValue';
import type { WeatherDay } from '../../../types/DashboardWeather';
import { formatPercent } from '../../../utils/formatNumber';

interface Props {
  days: WeatherDay[];
  /** The place's own date, from its `localTime` — the row it labels « Auj. ». */
  today: string | null;
  system: UnitSystem;
}

/** Above this chance of rain the probability is printed in the rain colour (`_spec.md` § 6 « bleue au-delà de 50 % »). */
const RAINY_CHANCE = 50;

/**
 * The five days of the Large card, `A5MeteoTailles.dc.html` l. 232-235 and
 * 299-318: rows `.wx-day { display: flex; align-items: center; gap: 12px;
 * min-height: 44px }`, spread on the height (`justify-content: space-between`);
 * per row the day (44 px / 15 / 700), the glyph (24 px), the chance of rain
 * (42 px / 14 / 700, `--rain` above 50 %), the minimum (34 px / 15, right
 * aligned), the 8 px bar on the WEEK's scale, the maximum (15 / 700).
 *
 * The weekday is `Intl` on the date's own local midnight (`weekdayShort`), so
 * « Jeu. » stays Thursday west of Greenwich; the place's own date reads
 * « Auj. ». A null chance of rain (K3) prints a dash with an accessible name,
 * never « 0 % ».
 */
export default function WeatherDays({ days, today, system }: Props) {
  const { t, i18n } = useTranslation();
  const tk = useDashboardTokens();
  const scale = weekScale(days);
  if (!scale) return null;

  return (
    <Box
      component="ul"
      data-weather-days
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        listStyle: 'none',
        m: 0,
        p: 0,
      }}
    >
      {days.map((day) => {
        const rainy = day.chanceOfRain !== null && day.chanceOfRain > RAINY_CHANCE;
        return (
          <Box
            component="li"
            key={day.date}
            data-weather-day={day.date}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: `${DASHBOARD_WEATHER.dayGap}px`,
              minHeight: DASHBOARD_WEATHER.dayRow,
            }}
          >
            <Typography
              component="span"
              sx={{
                width: DASHBOARD_WEATHER.dayLabelWidth,
                flexShrink: 0,
                fontSize: DASHBOARD_WEATHER.dayLabel,
                fontWeight: 700,
                color: 'text.secondary',
              }}
            >
              {day.date === today
                ? t('dashboard.blocks.weather.today')
                : (weekdayShort(day.date, i18n.language) ?? day.date)}
            </Typography>
            <WeatherGlyph
              code={day.conditionCode}
              isDay={true}
              px={DASHBOARD_WEATHER.dayIcon}
              label={day.conditionText}
            />
            <Typography
              component="span"
              aria-label={
                day.chanceOfRain === null ? t('dashboard.blocks.weather.unknownChance') : undefined
              }
              sx={{
                width: DASHBOARD_WEATHER.dayChanceWidth,
                flexShrink: 0,
                fontSize: DASHBOARD_WEATHER.dayChance,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: rainy ? tk.rainText : 'text.secondary',
              }}
            >
              {day.chanceOfRain === null ? '—' : formatPercent(day.chanceOfRain, i18n.language)}
            </Typography>
            <Typography
              component="span"
              sx={{
                width: DASHBOARD_WEATHER.dayTempWidth,
                flexShrink: 0,
                textAlign: 'right',
                fontSize: DASHBOARD_WEATHER.dayTemp,
                fontVariantNumeric: 'tabular-nums',
                color: 'text.secondary',
              }}
            >
              {t('dashboard.blocks.weather.degrees', {
                value: displayTemperature(day.minTempC, system),
              })}
            </Typography>
            <WeatherBar day={day} scale={scale} />
            <Typography
              component="span"
              sx={{
                width: DASHBOARD_WEATHER.dayTempWidth,
                flexShrink: 0,
                fontSize: DASHBOARD_WEATHER.dayTemp,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: 'text.primary',
              }}
            >
              {t('dashboard.blocks.weather.degrees', {
                value: displayTemperature(day.maxTempC, system),
              })}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
