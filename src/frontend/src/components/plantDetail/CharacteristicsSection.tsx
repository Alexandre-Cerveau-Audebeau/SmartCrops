import { memo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import type { Plant } from '../../types/Plant';
import { lightBar, phBar, frostBar } from '../../utils/characteristicsBars';
import { formatXDataRange, parseStringArray } from '../../utils/plantDetail';
import {
  regionsToContinents,
  CONTINENT_ORDER,
  type Continent,
} from '../../utils/tdwgContinents';
import SectionHeader from './SectionHeader';
import StatusBadge from './StatusBadge';
import { Sym } from '../Sym';

interface CharacteristicsSectionProps {
  plant: Plant;
}

type TFn = ReturnType<typeof useTranslation>['t'];

interface Bar {
  key: string;
  label: string;
  level: string | null;
  pct: number | null;
  rawValue: string | null;
  color: string;
}

interface RegionLine {
  present: boolean;
  label: string;
}

interface Regions {
  native: RegionLine;
  distribution: RegionLine;
}

// Bar fill colours as named constants (no magic inline hex — SMA-226).
const BAR_COLOR = {
  light: '#2E8B57',
  moisture: '#2C3E6B',
  soil: '#A0522D',
  frost: '#C0492F',
} as const;

// Origin / distribution pill palette (named — SMA-226).
const PILL = {
  originBg: '#EAF5EE',
  originText: '#1B5E3A',
  distBg: '#F2F6F0',
  distText: '#3a463f',
  labelText: '#9aa5a0',
} as const;

const NOT_PROVIDED_COLOR = '#9aa5a0';

interface BarColors {
  light: string;
  moisture: string;
  soil: string;
  frost: string;
}

// Build the six characteristic bars (SMA-39). Light, soil pH and frost map real
// Perenual/Plant data through the pure helpers (null → "Not provided"); soil
// moisture, atmospheric humidity and soil texture are always "Not provided" —
// no usable data source exists for them (SMA-240). Labels and order are fixed.
function buildBars(plant: Plant, t: TFn, c: BarColors): Bar[] {
  const C = 'plantDetail.characteristics.bars';
  const light = lightBar(
    plant.perenualData?.xSunlightHoursMin,
    plant.perenualData?.xSunlightHoursMax
  );
  const ph = phBar(plant.soilPhMin, plant.soilPhMax);
  const frost = frostBar(plant.hardinessZoneMin);

  // Raw values shown next to the label (formatXDataRange — same render as the
  // section-05 ranges; decimal point, locale-aware formatting tracked in SMA-244).
  const lightRaw = formatXDataRange(
    plant.perenualData?.xSunlightHoursMin ?? null,
    plant.perenualData?.xSunlightHoursMax ?? null,
    ' h'
  );
  const phRaw = formatXDataRange(plant.soilPhMin, plant.soilPhMax);
  const zoneRaw = formatXDataRange(
    plant.hardinessZoneMin,
    plant.hardinessZoneMax
  );
  const frostRaw = zoneRaw
    ? t('plantDetail.characteristics.frostZone', { range: zoneRaw })
    : null;

  return [
    {
      key: 'light',
      label: t(`${C}.light`),
      level: light ? t(light.levelKey) : null,
      pct: light?.pct ?? null,
      rawValue: lightRaw,
      color: c.light,
    },
    {
      key: 'soilMoisture',
      label: t(`${C}.soilMoisture`),
      level: null,
      pct: null,
      rawValue: null,
      color: c.moisture,
    },
    {
      key: 'atmoHumidity',
      label: t(`${C}.atmoHumidity`),
      level: null,
      pct: null,
      rawValue: null,
      color: c.moisture,
    },
    {
      key: 'soilTexture',
      label: t(`${C}.soilTexture`),
      level: null,
      pct: null,
      rawValue: null,
      color: c.soil,
    },
    {
      key: 'soilPh',
      label: t(`${C}.soilPh`),
      level: ph ? t(ph.levelKey) : null,
      pct: ph?.pct ?? null,
      rawValue: phRaw,
      color: c.soil,
    },
    {
      key: 'frostTolerance',
      label: t(`${C}.frostTolerance`),
      level: frost ? t(frost.levelKey) : null,
      pct: frost?.pct ?? null,
      rawValue: frostRaw,
      color: c.frost,
    },
  ];
}

// Turn a distinct continent list into a display line: empty → hidden;
// all 7 → "All continents"; otherwise the localised continent names joined in
// CONTINENT_ORDER (deterministic, set by regionsToContinents).
function toRegionLine(continents: Continent[], t: TFn): RegionLine {
  if (continents.length === 0) return { present: false, label: '' };
  if (continents.length === CONTINENT_ORDER.length) {
    return {
      present: true,
      label: t('plantDetail.characteristics.allContinents'),
    };
  }
  return {
    present: true,
    label: continents
      .map((c) => t(`plantDetail.characteristics.continents.${c}`))
      .join(', '),
  };
}

// Map the plant's raw TDWG region strings to native / distribution continent
// lines (SMA-39). A line with no data is hidden at render.
function buildRegions(plant: Plant, t: TFn): Regions {
  const nativeC = regionsToContinents(parseStringArray(plant.nativeRegions));
  const introC = regionsToContinents(parseStringArray(plant.introducedRegions));
  return {
    native: toRegionLine(nativeC, t),
    distribution: toRegionLine(introC, t),
  };
}

function BarRow({ bar, t }: { bar: Bar; t: TFn }) {
  const filled = bar.level != null && bar.pct != null;
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 2,
          mb: '6px',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '8px',
            minWidth: 0,
          }}
        >
          <Typography
            component="span"
            sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}
          >
            {bar.label}
          </Typography>
          {bar.rawValue && (
            <Typography
              component="span"
              sx={{ fontSize: 11, fontWeight: 500, color: 'text.secondary' }}
            >
              {bar.rawValue}
            </Typography>
          )}
        </Box>
        <Typography
          component="span"
          sx={{
            fontSize: 12,
            fontWeight: 600,
            color: filled ? 'text.secondary' : NOT_PROVIDED_COLOR,
          }}
        >
          {filled ? bar.level : t('plantDetail.characteristics.notProvided')}
        </Typography>
      </Box>
      <Box
        sx={{
          height: 10,
          width: '100%',
          borderRadius: '999px',
          bgcolor: 'surfaceSubtle',
          overflow: 'hidden',
        }}
      >
        {filled && (
          <Box
            sx={{
              height: '100%',
              width: `${bar.pct}%`,
              borderRadius: '999px',
              bgcolor: bar.color,
            }}
          />
        )}
      </Box>
    </Box>
  );
}

function RegionPill({
  label,
  text,
  bg,
  fg,
  icon,
}: {
  label: string;
  text: string;
  bg: string;
  fg: string;
  icon: string;
}) {
  return (
    <Box sx={{ flex: 1, minWidth: 200 }}>
      <Typography
        sx={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: PILL.labelText,
          fontWeight: 700,
          mb: '6px',
        }}
      >
        {label}
      </Typography>
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          px: '12px',
          py: '7px',
          borderRadius: '8px',
          bgcolor: bg,
          color: fg,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <Sym name={icon} size={17} color="inherit" />
        {text}
      </Box>
    </Box>
  );
}

/**
 * Section 06 — Characteristics as the design's bar-gauge panel (SMA-39).
 * Six labelled fill-bars (light, soil moisture, atmospheric humidity, soil
 * texture, soil pH, frost tolerance) over a grey track — light / soil pH /
 * frost from real data, the other three "Not provided" (no source, SMA-240) —
 * then a native-range / distribution continent-pill row derived from the
 * plant's TDWG regions. Each pill hides when its data is absent. Mode-aware,
 * BUILD NOW badge.
 */
export const CharacteristicsSection = memo(function CharacteristicsSection({
  plant,
}: CharacteristicsSectionProps) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const dark = palette.mode === 'dark';

  // Mode-aware bar fills: only the blue "moisture" pair differs in dark mode
  // (light keeps the design hex; dark uses the theme's blue secondary).
  const barColors: BarColors = {
    light: BAR_COLOR.light,
    moisture: dark ? palette.secondary.main : BAR_COLOR.moisture,
    soil: BAR_COLOR.soil,
    frost: BAR_COLOR.frost,
  };
  const bars = buildBars(plant, t, barColors);
  const regions = buildRegions(plant, t);
  const showRegions = regions.native.present || regions.distribution.present;

  return (
    <Box id="characteristics" sx={{ mb: 3, scrollMarginTop: '80px' }}>
      <SectionHeader
        title={t('plantDetail.sections.characteristics')}
        badge={<StatusBadge variant="build" />}
        mb="16px"
      />
      <Box
        sx={{
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'borderSubtle',
          borderRadius: '12px',
          p: '22px 24px',
          boxShadow: '0 1px 3px rgba(27,94,58,0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {bars.map((bar) => (
          <BarRow key={bar.key} bar={bar} t={t} />
        ))}

        {showRegions && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '20px',
              borderTop: '1px solid',
              borderColor: 'borderSubtle',
              pt: '16px',
            }}
          >
            {regions.native.present && (
              <RegionPill
                label={t('plantDetail.characteristics.nativeRange')}
                text={`${t('plantDetail.characteristics.nativePrefix')} · ${regions.native.label}`}
                bg={dark ? palette.primary.main : PILL.originBg}
                fg={dark ? palette.primary.contrastText : PILL.originText}
                icon="public"
              />
            )}
            {regions.distribution.present && (
              <RegionPill
                label={t('plantDetail.characteristics.distribution')}
                text={`${t('plantDetail.characteristics.introducedPrefix')} · ${regions.distribution.label}`}
                bg={dark ? palette.primary.main : PILL.distBg}
                fg={dark ? palette.primary.contrastText : PILL.distText}
                icon="travel_explore"
              />
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
});
