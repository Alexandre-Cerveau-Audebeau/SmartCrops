import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import WeatherGlyph from './WeatherGlyph';
import WeatherPlace from './WeatherPlace';
import { displayTemperature } from './weatherFormat';
import { DASHBOARD_WEATHER } from '../../../theme/dashboardTokens';
import type { UnitSystem } from '../../../contexts/unitSystemContextValue';
import type { DashboardSize } from '../../../types/Dashboard';
import type { WeatherCurrent, WeatherLocation } from '../../../types/DashboardWeather';

interface Props {
  location: WeatherLocation;
  /** Present by contract: the caller draws the « unavailable » state itself. */
  current: WeatherCurrent;
  size: DashboardSize;
  system: UnitSystem;
  /** The right-hand slot of the place line — the « 1/3 localisé » chip. */
  trailing?: ReactNode;
  /** Extra blocks under the condition, spread on the same column — the Small card's « Aujourd'hui » line and bar. */
  footer?: ReactNode;
  /** Makes the place name a button that opens the location dialog (V21 b) — see `WeatherPlace`. */
  onEditPlace?: () => void;
  editPlaceLabel?: string;
}

/**
 * The head of the weather card, `A5MeteoTailles.dc.html` l. 286-288 / 293 /
 * 297: the place line, then the hero glyph beside the temperature, then the
 * condition over the day's max / min — the three blocks « répartis sur toute
 * la hauteur » (`_spec.md` § 6), i.e. a column with `justify-content:
 * space-between`. On Medium and Large the column is the 160 px left third of
 * the head (200 px when the chip sits on the place line, A4 l. 288); on Small
 * it is the whole card, and the two footer blocks join the column.
 *
 * Measures, verbatim: `.wx-temp` 56 px / 800 / letter-spacing −0.03em /
 * tabular, `.wx-temp.s` 44 px; glyph 44 px (36 on Small) in `--sun`,
 * `--cloud` or `--rain`; `.wx-cond` 16 px / 600; `.wx-mm` 15 px « 29° / 16° ».
 * The temperature and the wind follow `useUnitSystem`, converted by the caller.
 */
export default function WeatherHero({
  location,
  current,
  size,
  system,
  trailing,
  footer,
  onEditPlace,
  editPlaceLabel,
}: Props) {
  const { t } = useTranslation();
  const small = size === 'small';
  const today = location.days[0];
  const degrees = (celsius: number) =>
    t('dashboard.blocks.weather.degrees', { value: displayTemperature(celsius, system) });

  return (
    <Box
      data-weather-hero
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minWidth: 0,
        ...(small
          ? { flex: 1, minHeight: 0 }
          : {
              width: trailing
                ? DASHBOARD_WEATHER.heroColumnWithChip
                : DASHBOARD_WEATHER.heroColumn,
              flexShrink: 0,
              height: '100%',
            }),
      }}
    >
      <WeatherPlace
        name={location.name}
        trailing={trailing}
        onEdit={onEditPlace}
        editLabel={editPlaceLabel}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: small ? '8px' : '12px' }}>
        {/* The glyph is decorative: the condition text beside it names the
            weather, in the provider's own words. */}
        <WeatherGlyph
          code={current.conditionCode}
          isDay={current.isDay}
          px={small ? DASHBOARD_WEATHER.heroIconSmall : DASHBOARD_WEATHER.heroIcon}
        />
        <Typography
          component="span"
          data-weather-temperature
          sx={{
            fontSize: small ? DASHBOARD_WEATHER.temperatureSmall : DASHBOARD_WEATHER.temperature,
            lineHeight: 1,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            fontVariantNumeric: 'tabular-nums',
            color: 'text.primary',
          }}
        >
          {degrees(current.tempC)}
        </Typography>
      </Box>

      <Box>
        {current.conditionText && (
          <Typography
            sx={{
              fontSize: DASHBOARD_WEATHER.condition,
              fontWeight: 600,
              color: 'text.secondary',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {current.conditionText}
          </Typography>
        )}
        {today && (
          <Typography
            sx={{
              fontSize: DASHBOARD_WEATHER.minMax,
              color: 'text.secondary',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {t('dashboard.blocks.weather.minMax', {
              max: degrees(today.maxTempC),
              min: degrees(today.minTempC),
            })}
          </Typography>
        )}
      </Box>

      {footer}
    </Box>
  );
}
