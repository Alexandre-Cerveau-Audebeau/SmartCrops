import { memo } from 'react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { lightBar, frostBar } from '../../utils/characteristicsBars';
import { formatXDataRange } from '../../utils/plantDetail';
import SectionHeader from '../../components/plantDetail/SectionHeader';
import StatusBadge from '../../components/plantDetail/StatusBadge';
import { Sym } from '../../components/Sym';
import { eggFontSx } from '../fontSx';
import type { EasterEggEntry } from '../types';

type TFn = ReturnType<typeof useTranslation>['t'];

interface Bar {
  /** React list identity. Unique by construction, see `bars` below. */
  key: string;
  /** The name this bar's hover note is filed under in `egg.barTooltips`. */
  tipKey: string;
  label: string;
  level: string | null;
  pct: number | null;
  rawValue: string | null;
  color: string;
}

// Bar fill colours as named constants (no magic inline hex, SMA-226).
const BAR_COLOR = {
  light: '#2E8B57',
  frost: '#C0492F',
} as const;

// Origin / distribution pill palette (named, SMA-226).
const PILL = {
  originBg: '#EAF5EE',
  originText: '#1B5E3A',
  distBg: '#F2F6F0',
  distText: '#3a463f',
  labelText: '#9aa5a0',
} as const;

const NOT_PROVIDED_COLOR = '#9aa5a0';

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
          {filled && bar.rawValue && (
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
          maxWidth: '100%',
        }}
      >
        <Sym name={icon} size={17} color="inherit" />
        <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          {text}
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Section 06 for an easter egg: CharacteristicsSection's bar panel and region
 * pills, verbatim. Light and frost tolerance still come from this entry's real
 * fields through the same pure helpers; the four bars the catalogue can never
 * fill for it are dropped rather than shown empty, and its own axes are added
 * with a hover note each. The pills take written text, because the TDWG mapping
 * would flatten "Japan" to its continent.
 */
export const EggCharacteristics = memo(function EggCharacteristics({
  egg,
}: {
  egg: EasterEggEntry;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const dark = palette.mode === 'dark';
  const plant = egg.plant;
  const C = 'plantDetail.characteristics.bars';

  const light = lightBar(
    plant.perenualData?.xSunlightHoursMin,
    plant.perenualData?.xSunlightHoursMax
  );
  const frost = frostBar(plant.hardinessZoneMin);
  const lightRaw = formatXDataRange(
    plant.perenualData?.xSunlightHoursMin ?? null,
    plant.perenualData?.xSunlightHoursMax ?? null,
    ' h'
  );
  const zoneRaw = formatXDataRange(
    plant.hardinessZoneMin,
    plant.hardinessZoneMax
  );

  // The two catalogue bars keep their own names; the entry's own bars are
  // namespaced, so an entry that declares a `light` or `frostTolerance` bar
  // cannot collide with them and hand React two rows with the same key. The
  // hover note is still filed under the unprefixed name.
  const bars: Bar[] = [
    {
      key: 'light',
      tipKey: 'light',
      label: t(`${C}.light`),
      level: light ? t(light.levelKey) : null,
      pct: light?.pct ?? null,
      rawValue: lightRaw,
      color: BAR_COLOR.light,
    },
    {
      key: 'frostTolerance',
      tipKey: 'frostTolerance',
      label: t(`${C}.frostTolerance`),
      level: frost ? t(frost.levelKey) : null,
      pct: frost?.pct ?? null,
      rawValue: zoneRaw
        ? t('plantDetail.characteristics.frostZone', { range: zoneRaw })
        : null,
      color: BAR_COLOR.frost,
    },
    ...egg.bars.map((b) => ({
      ...b,
      key: `egg-${b.key}`,
      tipKey: b.key,
      rawValue: null,
    })),
  ];

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
        {bars.map((bar) => {
          const row = <BarRow bar={bar} t={t} />;
          const tip = egg.barTooltips[bar.tipKey];
          return tip ? (
            <Tooltip
              key={bar.key}
              title={tip}
              arrow
              placement="top"
              // Tooltips portal out of the page container, so the Japanese
              // notes (さむい！) need the stack re-applied on the popper itself.
              slotProps={{ tooltip: { sx: eggFontSx(egg.fontStack) } }}
            >
              <Box>{row}</Box>
            </Tooltip>
          ) : (
            <Box key={bar.key}>{row}</Box>
          );
        })}

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
          <RegionPill
            label={t('plantDetail.characteristics.nativeRange')}
            text={egg.regions.native}
            bg={dark ? palette.primary.main : PILL.originBg}
            fg={dark ? palette.primary.contrastText : PILL.originText}
            icon="public"
          />
          <RegionPill
            label={t('plantDetail.characteristics.distribution')}
            text={egg.regions.distribution}
            bg={dark ? palette.primary.main : PILL.distBg}
            fg={dark ? palette.primary.contrastText : PILL.distText}
            icon="travel_explore"
          />
        </Box>
      </Box>
    </Box>
  );
});
