import { memo } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { useTranslation } from 'react-i18next';
import type { PlantPerenualData } from '../../types/Plant';
import { toCamelKey } from '../../utils/plantDetail';
import SectionHeader from './SectionHeader';
import StatusBadge from './StatusBadge';
import { Sym } from '../Sym';

interface CultureSectionProps {
  perenualData: PlantPerenualData | null;
}

const MONTH_ORDER = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/**
 * Growing & propagation for Plant Detail v2 (SMA-231, section 07). Clones the
 * "Available" card of {@link ScientificDataSection}: a list of factual rows
 * (propagation methods, pruning months, watering rhythm) read from the
 * dé-gated Perenual factual fields. Each value is translated; empty rows are
 * hidden (filter on `Boolean(value)`). BUILD NOW badge. Mounted only when at
 * least one value exists (gating preserved). Anchor `id="edible"` unchanged.
 */
export const CultureSection = memo(function CultureSection({
  perenualData,
}: CultureSectionProps) {
  const { t } = useTranslation();
  const pd = perenualData;

  const methods = pd?.propagationMethods
    ? pd.propagationMethods
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((m) =>
          t(`plantDetail.culture.propagationMethods.${toCamelKey(m)}`, m)
        )
        .join(', ')
    : '';

  const months = pd?.pruningMonths
    ? pd.pruningMonths
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .sort((a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b))
        .map((m) => t(`periods.months.${m}`, m))
        .join(', ')
    : '';

  const wb = pd?.wateringBenchmark?.trim();
  const watering = wb
    ? `${wb} ${
        pd?.wateringBenchmarkUnit
          ? t(
              `plantDetail.culture.units.${pd.wateringBenchmarkUnit}${
                wb === '1' ? '_one' : ''
              }`,
              pd.wateringBenchmarkUnit
            )
          : ''
      }`.trim()
    : '';

  const rows = [
    {
      icon: 'eco',
      label: t('plantDetail.culture.propagationLabel'),
      value: methods,
    },
    {
      icon: 'content_cut',
      label: t('plantDetail.culture.pruningLabel'),
      value: months,
    },
    {
      icon: 'water_drop',
      label: t('plantDetail.culture.wateringLabel'),
      value: watering,
    },
  ].filter((r): r is { icon: string; label: string; value: string } =>
    Boolean(r.value)
  );

  // Belt-and-braces: never render an empty card even if showCulture and the
  // row set ever diverged (SMA-231).
  if (rows.length === 0) return null;

  return (
    <Box id="edible" sx={{ mb: 3, scrollMarginTop: '80px' }}>
      <SectionHeader
        title={t('plantDetail.sections.edibleAndPropagation')}
        badge={<StatusBadge variant="build" />}
        mb="16px"
      />
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
        <Stack spacing="10px">
          {rows.map((r) => (
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
        </Stack>
      </Box>
    </Box>
  );
});
