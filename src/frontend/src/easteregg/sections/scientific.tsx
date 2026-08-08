import { memo } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { useUnitSystem } from '../../hooks/useUnitSystem';
import SectionHeader from '../../components/plantDetail/SectionHeader';
import StatusBadge from '../../components/plantDetail/StatusBadge';
import { Sym } from '../../components/Sym';
import {
  formatSpacing,
  formatTemperature,
  formatXDataRange,
  parseStringArrayJson,
  toCamelKey,
} from '../../utils/plantDetail';
import type { EasterEggEntry } from '../types';
import { scientificData } from '../visibility';

type ComingItemKey =
  | 'light'
  | 'water'
  | 'npk'
  | 'germination'
  | 'humidity'
  | 'temp';

// Six sensor placeholders for the dashed "Coming" teaser card (design HTML).
const COMING_ITEMS: ReadonlyArray<{ key: ComingItemKey; icon: string }> = [
  { key: 'light', icon: 'wb_incandescent' },
  { key: 'water', icon: 'water_drop' },
  { key: 'npk', icon: 'compost' },
  { key: 'germination', icon: 'timer' },
  { key: 'humidity', icon: 'humidity_percentage' },
  { key: 'temp', icon: 'thermostat' },
];

/**
 * Section 05 for an easter egg: ScientificDataSection's two-column card,
 * verbatim. The Available column still formats this entry's real xData through
 * the shared unit-aware helpers, so the metric/imperial toggle keeps working;
 * the written rows and the extra chip groups are appended to it.
 */
export const EggScientific = memo(function EggScientific({
  egg,
}: {
  egg: EasterEggEntry;
}) {
  const { t } = useTranslation();
  const { system } = useUnitSystem();
  const dark = useTheme().palette.mode === 'dark';
  // `scientificData` is the one expression; `scientificVisible` is defined in
  // terms of it, so the guard here and the gates in EasterEggDetail cannot
  // disagree. Reading it this way also lets TypeScript narrow `pd` below.
  const pd = scientificData(egg);
  if (pd === null) return null;

  const sd = 'plantDetail.scientificData';
  const written = egg.scientific;

  const phRange = formatXDataRange(pd.xWateringPhMin, pd.xWateringPhMax);
  const wateringTemp = formatTemperature(
    pd.xWateringBasedTempMinC,
    pd.xWateringBasedTempMaxC,
    system
  );
  const sunlight = formatXDataRange(
    pd.xSunlightHoursMin,
    pd.xSunlightHoursMax,
    ' h'
  );
  const tempTol = formatTemperature(
    pd.xTemperatureToleranceMinC,
    pd.xTemperatureToleranceMaxC,
    system
  );
  const spacing = formatSpacing(
    pd.xPlantSpacingValue,
    pd.xPlantSpacingUnit,
    system
  );
  const waterQuality = parseStringArrayJson(pd.xWateringQualityJson);
  const wateringPeriod = parseStringArrayJson(pd.xWateringPeriodJson);

  const availableRows = [
    { icon: 'science', label: t(`${sd}.wateringPh`), value: phRange },
    {
      icon: 'device_thermostat',
      label: written.idealTempLabel ?? t(`${sd}.wateringIdealTemp`),
      value: wateringTemp,
    },
    { icon: 'light_mode', label: t(`${sd}.sunlightHours`), value: sunlight },
    { icon: 'open_in_full', label: t(`${sd}.spacing`), value: spacing },
    { icon: 'ac_unit', label: t(`${sd}.temperatureTolerance`), value: tempTol },
  ]
    .filter((r): r is { icon: string; label: string; value: string } =>
      Boolean(r.value)
    )
    .concat(written.extraRows ?? []);

  const chips = (label: string, values: readonly string[], dict: string) => (
    <Box>
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 700,
          color: 'text.secondary',
          mb: 0.75,
        }}
      >
        {label}
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={0.5}>
        {values.map((v, i) => (
          <Chip
            key={`${v}-${i}`}
            size="small"
            label={t(`${sd}.${dict}.${toCamelKey(v)}`, v)}
          />
        ))}
      </Stack>
    </Box>
  );

  const waterUnit = t(
    system === 'imperial'
      ? `${sd}.coming.water.unitImperial`
      : `${sd}.coming.water.unitMetric`
  );

  return (
    <Box id="scientific-data" sx={{ scrollMarginTop: '80px', mb: 3 }}>
      {/* ── Title + COMING SOON · DATA badge (OUTSIDE the cards) ──────────── */}
      <SectionHeader
        title={t(`${sd}.sectionTitle`)}
        badge={<StatusBadge variant="data" />}
        mb="4px"
      />

      <Typography
        sx={{ m: 0, mb: '14px', fontSize: 13, color: 'text.secondary' }}
      >
        {t(`${sd}.caption`)}
      </Typography>

      {/* ── Two-column grid: Available (real) | Coming (teaser) ───────────── */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: '16px',
          alignItems: 'start',
        }}
      >
        {/* Available */}
        <Box
          sx={{
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'borderSubtle',
            borderRadius: '12px',
            p: '18px 20px',
            // A light-mode green shadow, as PestsSection branches it: on the
            // dark canvas it reads as a green halo instead of a lift.
            boxShadow: dark ? 'none' : '0 1px 3px rgba(27,94,58,0.05)',
          }}
        >
          <Box
            component="h3"
            sx={{
              m: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: 13,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'heading',
              mb: '14px',
            }}
          >
            <Sym name="check_circle" size={18} color="inherit" />
            {t(`${sd}.availableTitle`)}
          </Box>
          <Stack spacing="10px">
            {availableRows.map((r) => (
              <Box
                // The label is the row's identity. An icon is a presentation
                // choice this entry already reuses across rows, and `extraRows`
                // invites more of the same.
                key={r.label}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  p: '10px 12px',
                  bgcolor: 'surfaceSubtle',
                  color: 'primary.main',
                  borderRadius: '9px',
                }}
              >
                <Sym name={r.icon} size={20} color="inherit" />
                <Box
                  sx={{
                    flex: 1,
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'text.primary',
                  }}
                >
                  {r.label}
                </Box>
                <Box sx={{ fontSize: 14, fontWeight: 700, color: 'heading' }}>
                  {r.value}
                </Box>
              </Box>
            ))}
            {waterQuality &&
              chips(
                t(`${sd}.waterQuality`),
                waterQuality,
                'waterQualityValues'
              )}
            {wateringPeriod &&
              chips(
                t(`${sd}.wateringPeriod`),
                wateringPeriod,
                'wateringPeriodValues'
              )}
            {written.chipGroups?.map((g) => (
              <Box key={g.key}>
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'text.secondary',
                    mb: 0.75,
                  }}
                >
                  {g.label}
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.5}>
                  {g.values.map((v) => (
                    <Chip key={v} size="small" label={v} />
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        </Box>

        {/* Coming (teaser) */}
        <Box
          sx={{
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'borderSubtle',
            borderRadius: '12px',
            p: '18px 20px',
          }}
        >
          <Box
            component="h3"
            sx={{
              m: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: 13,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'eyebrow',
              mb: '14px',
            }}
          >
            <Sym name="pending" size={18} color="inherit" />
            {t(`${sd}.comingTitle`)}
          </Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
            }}
          >
            {COMING_ITEMS.map((c) => (
              <Box
                key={c.key}
                sx={{
                  bgcolor: 'background.paper',
                  border: '1px dashed',
                  borderColor: 'borderSubtle',
                  borderRadius: '9px',
                  p: '11px 12px',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    color: 'eyebrow',
                  }}
                >
                  <Sym name={c.icon} size={17} color="inherit" />
                  <Box
                    sx={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'text.secondary',
                    }}
                  >
                    {t(`${sd}.coming.${c.key}.label`)}
                  </Box>
                </Box>
                <Box
                  sx={{
                    mt: '8px',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '5px',
                  }}
                >
                  <Box
                    sx={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: 'mutedText',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {/* The catalogue's own no-value glyph, kept identical.
                        Written as an escape so a grep for the em dash across
                        this folder still comes back empty. */}
                    {'\u2014'}
                  </Box>
                  <Box sx={{ fontSize: 11, fontWeight: 600, color: 'eyebrow' }}>
                    {c.key === 'water'
                      ? waterUnit
                      : t(`${sd}.coming.${c.key}.unit`)}
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
});
