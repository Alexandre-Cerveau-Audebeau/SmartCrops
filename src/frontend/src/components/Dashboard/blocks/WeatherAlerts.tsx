import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { SvgIconComponent } from '@mui/icons-material';
import AcUnitOutlinedIcon from '@mui/icons-material/AcUnitOutlined';
import AirOutlinedIcon from '@mui/icons-material/AirOutlined';
import ThermostatOutlinedIcon from '@mui/icons-material/ThermostatOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined';
import { displaySpeed, displayTemperature, truncate } from './weatherFormat';
import {
  WEATHER_RULES,
  type GardeningChip,
  type GardeningChipKind,
  type WeatherChipLine,
} from './weatherRules';
import { weekdayLong } from './weatherTime';
import { DASHBOARD_TYPE, DASHBOARD_WEATHER } from '../../../theme/dashboardTokens';
import { useDashboardTokens } from '../../../theme/useDashboardTokens';
import type { UnitSystem } from '../../../contexts/unitSystemContextValue';

interface Props {
  line: WeatherChipLine;
  /** The place's own date — a chip on that day says « aujourd'hui ». */
  today: string | null;
  system: UnitSystem;
  /** The « Dernière météo connue · il y a 2 h » note of a stale place, drawn before the units. */
  note?: ReactNode;
}

/** The glyph of each derived chip (§ E.3): frost, heat, wind, rain — never the colour alone. */
const CHIP_ICONS: Record<GardeningChipKind, SvgIconComponent> = {
  frost: AcUnitOutlinedIcon,
  frostRisk: AcUnitOutlinedIcon,
  heat: ThermostatOutlinedIcon,
  wind: AirOutlinedIcon,
  rain: WaterDropOutlinedIcon,
};

/**
 * The alert line of the Large card, `A5MeteoTailles.dc.html` l. 149-150 and
 * 319: `.pill.warn { height: 28px; font-size: 14px; font-weight: 700;
 * background: --warn-bg; color: --warn-tx; border: 1px solid --warn-bd }`, its
 * 16 px glyph in `--warn-ic`, on a `flex-wrap` row with a 10 px gap, and the
 * units note `.sub` « °C · km/h » pushed right.
 *
 * Two sources on one line (arbitrage Q7): the OFFICIAL alerts first — event
 * cut to 40 characters, the headline in a tooltip and in the accessible name —
 * then OUR derived chips, the whole capped by `weatherChips`. Values follow the
 * unit system: « −2° » / « 28° », « 55 km/h » / « 34 mph »; rainfall stays in
 * millimetres.
 */
export default function WeatherAlerts({ line, today, system, note }: Props) {
  const { t, i18n } = useTranslation();
  const tk = useDashboardTokens();

  const pillSx = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    height: DASHBOARD_WEATHER.alertChip,
    px: '10px',
    borderRadius: '999px',
    fontSize: DASHBOARD_WEATHER.alertChipText,
    lineHeight: 1,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    backgroundColor: tk.warnBg,
    color: tk.warnText,
    border: `1px solid ${tk.warnBorder}`,
    maxWidth: '100%',
  } as const;

  const iconSx = { fontSize: DASHBOARD_WEATHER.alertChipIcon, color: tk.warnIcon, flexShrink: 0 };

  const dayOf = (chip: GardeningChip) =>
    chip.date === today
      ? t('dashboard.blocks.weather.todayLong')
      : (weekdayLong(chip.date, i18n.language) ?? chip.date);

  const valueOf = (chip: GardeningChip) => {
    switch (chip.kind) {
      case 'frost':
      case 'frostRisk':
      case 'heat':
        return t('dashboard.blocks.weather.degrees', {
          value: displayTemperature(chip.value, system),
        });
      case 'wind':
        return t(`dashboard.blocks.weather.wind.${system}`, {
          value: displaySpeed(chip.value, system),
        });
      case 'rain':
        return t('dashboard.blocks.weather.rainMm', { value: chip.value });
    }
  };

  return (
    <Box
      data-weather-alerts
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: `${DASHBOARD_WEATHER.alertGap}px`,
        flexWrap: 'wrap',
      }}
    >
      {line.official.map((alert, index) => (
        <Tooltip key={`${alert.headline}-${index}`} title={alert.headline}>
          {/* A NAMED GROUP that takes the focus (round 1, G3 — GitHub
              4008082507; Extension bbf99db9 / 698a63fa): the tooltip carries
              the full headline the chip truncates, and MUI's Tooltip opens on
              the focus of its child — so the child must be focusable, and a
              generic `span` cannot carry an author name. `group`, not `img`:
              the chip groups a glyph and a text, it is not a picture. */}
          <Box
            component="span"
            data-weather-alert="official"
            role="group"
            tabIndex={0}
            aria-label={t('dashboard.blocks.weather.officialAlert', { headline: alert.headline })}
            sx={{
              ...pillSx,
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            }}
          >
            <WarningAmberOutlinedIcon aria-hidden sx={iconSx} />
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {truncate(alert.event ?? alert.headline, WEATHER_RULES.eventMaxChars)}
            </Box>
          </Box>
        </Tooltip>
      ))}
      {line.derived.map((chip) => {
        const Icon = CHIP_ICONS[chip.kind];
        return (
          <Box component="span" key={chip.kind} data-weather-alert={chip.kind} sx={pillSx}>
            <Icon aria-hidden sx={iconSx} />
            {t(`dashboard.blocks.weather.chips.${chip.kind}`, {
              day: dayOf(chip),
              value: valueOf(chip),
            })}
          </Box>
        );
      })}
      <Box
        sx={{
          ml: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
        }}
      >
        {note}
        <Typography
          component="span"
          data-weather-units
          sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary', whiteSpace: 'nowrap' }}
        >
          {t(`dashboard.blocks.weather.units.${system}`)}
        </Typography>
      </Box>
    </Box>
  );
}
