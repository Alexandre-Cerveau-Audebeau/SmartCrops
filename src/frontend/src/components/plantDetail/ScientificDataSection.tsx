import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ScienceIcon from '@mui/icons-material/Science';
import { useUnitSystem } from '../../hooks/useUnitSystem';
import type { Plant } from '../../types/Plant';
import {
  formatSpacing,
  formatTemperature,
  formatXDataRange,
  parseStringArrayJson,
  toCamelKey,
} from '../../utils/plantDetail';

/**
 * Perenual Supreme scientific-data section for Plant Detail v2 (SMA-178 part A).
 * Extracted from the inline IIFE; convertible measures honour the unit toggle via
 * the shared formatters. Pure: the parent mounts it only when `showScientificData`
 * is true (Supreme data present + at least one xData field), so the TOC stays in
 * sync; the `pd` null-check below is type-narrowing only, not a visibility gate.
 */
export default function ScientificDataSection({ plant }: { plant: Plant }) {
  const { t } = useTranslation();
  const { system } = useUnitSystem();
  const pd = plant.perenualData;
  if (!pd) return null;

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

  const row = (label: string, value: string) => (
    <Stack direction="row" justifyContent="space-between" spacing={2}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, textAlign: 'right' }}>
        {value}
      </Typography>
    </Stack>
  );

  const chips = (label: string, values: string[], dict: string) => (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={0.5}>
        {values.map((v, i) => (
          <Chip
            key={`${v}-${i}`}
            size="small"
            label={t(`plantDetail.scientificData.${dict}.${toCamelKey(v)}`, v)}
          />
        ))}
      </Stack>
    </Box>
  );

  return (
    <Card
      id="scientific-data"
      variant="outlined"
      sx={{ mb: 3, borderRadius: 3, scrollMarginTop: '80px' }}
    >
      <CardContent>
        <Stack direction="row" spacing={2} alignItems="flex-start">
          <ScienceIcon sx={{ color: 'success.main', mt: 0.5 }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 1.5 }}>
              {t('plantDetail.scientificData.title')}
            </Typography>
            <Stack spacing={1.25}>
              {phRange &&
                row(t('plantDetail.scientificData.wateringPh'), phRange)}
              {wateringTemp &&
                row(
                  t('plantDetail.scientificData.wateringIdealTemp'),
                  wateringTemp
                )}
              {sunlight &&
                row(t('plantDetail.scientificData.sunlightHours'), sunlight)}
              {tempTol &&
                row(
                  t('plantDetail.scientificData.temperatureTolerance'),
                  tempTol
                )}
              {spacing && row(t('plantDetail.scientificData.spacing'), spacing)}
              {waterQuality &&
                chips(
                  t('plantDetail.scientificData.waterQuality'),
                  waterQuality,
                  'waterQualityValues'
                )}
              {wateringPeriod &&
                chips(
                  t('plantDetail.scientificData.wateringPeriod'),
                  wateringPeriod,
                  'wateringPeriodValues'
                )}
            </Stack>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
