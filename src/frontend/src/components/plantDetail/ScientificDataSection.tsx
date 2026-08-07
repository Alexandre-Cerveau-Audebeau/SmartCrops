import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useUnitSystem } from '../../hooks/useUnitSystem';
import type { Plant } from '../../types/Plant';
import SectionHeader from './SectionHeader';
import StatusBadge from './StatusBadge';
import {
  formatSpacing,
  formatTemperature,
  formatXDataRange,
  parseStringArrayJson,
  toCamelKey,
} from '../../utils/plantDetail';
import { Sym } from '../Sym';

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
 * Perenual Supreme scientific-data section for Plant Detail v2 (SMA-78, PR C) —
 * available/coming hybrid, pixel-matched to the Claude Design HTML. The title +
 * COMING SOON · DATA badge + caption live outside the cards; then a two-column
 * grid: an "Available" card listing the real Perenual xData metrics (unit-aware,
 * hide-if-null) plus the existing water-quality/period chips, and a dashed
 * "Coming · exact measurements" teaser with six sensor placeholders. Gating
 * unchanged (parent mounts only when `showScientificData`); the `pd` null-check
 * is type-narrowing only.
 */
// --- SMA-394 easter eggs — delete this block to remove ---
/**
 * Additions for an entry whose parameters are written rather than measured:
 * `idealTempLabel` renames the watering-temperature row, `extraRows` appends to
 * the Available column in its own row grammar, and `chipGroups` adds chip
 * blocks beside the water-quality chips (values are verbatim, not i18n keys).
 */
export interface WrittenScientificData {
  readonly idealTempLabel?: string;
  readonly extraRows?: readonly {
    readonly icon: string;
    readonly label: string;
    readonly value: string;
  }[];
  readonly chipGroups?: readonly {
    readonly key: string;
    readonly label: string;
    readonly values: readonly string[];
  }[];
}
// --- end SMA-394 ---

export default function ScientificDataSection({
  plant,
  // --- SMA-394 easter eggs — delete this line to remove ---
  written,
  // --- end SMA-394 ---
}: {
  plant: Plant;
  written?: WrittenScientificData;
}) {
  const { t } = useTranslation();
  const { system } = useUnitSystem();
  const pd = plant.perenualData;
  if (!pd) return null;

  const sd = 'plantDetail.scientificData';

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

  // Real metrics — hide a row when its source field is null.
  const availableRows = [
    { icon: 'science', label: t(`${sd}.wateringPh`), value: phRange },
    {
      icon: 'device_thermostat',
      label: written?.idealTempLabel ?? t(`${sd}.wateringIdealTemp`),
      value: wateringTemp,
    },
    { icon: 'light_mode', label: t(`${sd}.sunlightHours`), value: sunlight },
    { icon: 'open_in_full', label: t(`${sd}.spacing`), value: spacing },
    { icon: 'ac_unit', label: t(`${sd}.temperatureTolerance`), value: tempTol },
  ]
    .filter((r): r is { icon: string; label: string; value: string } =>
      Boolean(r.value)
    )
    // --- SMA-394 easter eggs — delete this line to remove ---
    .concat(written?.extraRows ?? []);
  // --- end SMA-394 ---

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
            boxShadow: '0 1px 3px rgba(27,94,58,0.05)',
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
                key={r.icon}
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
            {/* --- SMA-394 easter eggs — delete this block to remove --- */}
            {written?.chipGroups?.map((g) => (
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
            {/* --- end SMA-394 --- */}
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
                    —
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
}
