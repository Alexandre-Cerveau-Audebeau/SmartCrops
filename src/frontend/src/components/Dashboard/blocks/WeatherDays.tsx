import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { visuallyHidden } from '@mui/utils';
import WeatherBar from './WeatherBar';
import WeatherGlyph from './WeatherGlyph';
import { displayTemperature } from './weatherFormat';
import { weekScale, weekdayShort } from './weatherTime';
import { useRowBudget } from '../useRowBudget';
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
 * A figure for the eye and a sentence for the ear (round 1, G5 — GitHub
 * 4008082523; E5 / E6 — Extension 7779069d / 29ad2a6a). A row read « Tue,
 * Sunny, 80%, 9°, 17° » with nothing saying which degree was the minimum, and
 * the dash of an unknown chance carried an `aria-label` on a generic `span`,
 * which the ARIA contract does not name. The visible text is hidden from
 * assistive technology and the spoken one sits off-screen — `visuallyHidden`,
 * the product's one recipe — so the accessible name comes from CONTENT, with
 * no role to invent for a number.
 */
function Spoken({ visible, sentence }: { visible: string; sentence: string }) {
  return (
    <>
      <span aria-hidden>{visible}</span>
      <Box component="span" sx={visuallyHidden}>
        {sentence}
      </Box>
    </>
  );
}

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
 *
 * WHOLE rows only (SMA-336 mobile lot, step 3 — pre-flight constat 12). The
 * artboard gives the days what is left of the card (`A5MeteoTailles.dc.html`
 * l. 299: `flex: 1; justify-content: space-between`, rows of `min-height:
 * 44px`, l. 232) and budgets the partial invitation at 122 px (`_spec.md`
 * § 10.25); the invitation WITH its field and its help line is ≈ 160 px on a
 * 566 px card, so on a desktop the five rows ran under it — « Mar. » and
 * « Mer. » printed through the dashed panel. Measured now: the list is
 * `overflow: hidden`, and the rows that do not fit its height are hidden
 * whole (`useRowBudget`) — « Auj. », « Dim. », « Lun. » with the invitation,
 * the five days without it — never a row cut through its glyphs. On a phone
 * the row is as tall as its card (step 1) and all five always fit.
 */
export default function WeatherDays({ days, today, system }: Props) {
  const { t, i18n } = useTranslation();
  const tk = useDashboardTokens();
  const listRef = useRef<HTMLUListElement>(null);
  const budget = useRowBudget(listRef, days.length, 0);
  const scale = weekScale(days);
  if (!scale) return null;
  // Always one: a card that cannot hold « Auj. » shows it clipped rather than nothing.
  const visibleRows = Math.max(1, Math.min(days.length, budget));

  return (
    <Box
      component="ul"
      ref={listRef}
      data-weather-days
      sx={{
        flex: 1,
        minHeight: 0,
        // What the budget hides stays inside the list, never under the panel
        // that follows (the V34 mechanism, pre-flight cause C4). With the
        // rows overflowing, `space-between` packs from the top by definition.
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        listStyle: 'none',
        m: 0,
        p: 0,
      }}
    >
      {days.map((day, index) => {
        const rainy = day.chanceOfRain !== null && day.chanceOfRain > RAINY_CHANCE;
        const chance = day.chanceOfRain === null ? null : formatPercent(day.chanceOfRain, i18n.language);
        const min = displayTemperature(day.minTempC, system);
        const max = displayTemperature(day.maxTempC, system);
        // Beyond the budget: kept in the DOM for the observer, hidden from the
        // eye AND from the reader, so what is said is what is shown.
        const hidden = index >= visibleRows;
        return (
          <Box
            component="li"
            key={day.date}
            data-weather-day={day.date}
            data-weather-day-hidden={hidden ? '' : undefined}
            aria-hidden={hidden || undefined}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: `${DASHBOARD_WEATHER.dayGap}px`,
              minHeight: DASHBOARD_WEATHER.dayRow,
              visibility: hidden ? 'hidden' : 'visible',
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
              sx={{
                width: DASHBOARD_WEATHER.dayChanceWidth,
                flexShrink: 0,
                fontSize: DASHBOARD_WEATHER.dayChance,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: rainy ? tk.rainText : 'text.secondary',
              }}
            >
              {chance === null ? (
                <Spoken visible="—" sentence={t('dashboard.blocks.weather.unknownChance')} />
              ) : (
                <Spoken
                  visible={chance}
                  sentence={t('dashboard.blocks.weather.chanceOfRainLabel', { value: chance })}
                />
              )}
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
              <Spoken
                visible={t('dashboard.blocks.weather.degrees', { value: min })}
                sentence={t('dashboard.blocks.weather.minLabel', { value: min })}
              />
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
              <Spoken
                visible={t('dashboard.blocks.weather.degrees', { value: max })}
                sentence={t('dashboard.blocks.weather.maxLabel', { value: max })}
              />
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
