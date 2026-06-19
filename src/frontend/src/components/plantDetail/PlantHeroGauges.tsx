import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Sym } from '../Sym';
import type { Plant } from '../../types/Plant';
import { useUnitSystem } from '../../hooks/useUnitSystem';
import {
  formatHardinessZone,
  formatLength,
  formatSpacing,
  formatTemperature,
  formatXDataRange,
} from '../../utils/plantDetail';

interface Gauge {
  key: string;
  icon: string;
  label: string;
  value: string;
}

/**
 * Hero "growing conditions" gauge row (SMA-169, Plant Detail v2). Up to eight
 * pills — Sun · Water · Hardiness · Height · pH · Temperature · Spacing · Care —
 * each reusing the SAME DTO fields + formatters the Characteristics / Scientific
 * sections already render, so values stay consistent across the page (the
 * temporary hero/Characteristics duplication is resolved in the Characteristics
 * slice).
 *
 * "Always rich, never padded": every gauge is hidden when its value is absent
 * (each formatter returns null on missing data; the enum gauges skip when their
 * field is null), so we show exactly the conditions the plant actually has. The
 * whole row renders nothing when no gauge has a value.
 *
 * Convertible measures (height, temperature, spacing) honour the metric/imperial
 * toggle via the shared unit-aware formatters (SMA-178); sun hours, pH, hardiness
 * zone and the qualitative levels are shown verbatim. pH is the WATERING pH
 * (Perenual xData), not soil pH.
 *
 * SMA-39: pixel-match the Claude Design reference — each card is a tinted
 * Material-Symbols icon tile beside an uppercase label and a bold value.
 */
export default function PlantHeroGauges({ plant }: { plant: Plant }) {
  const { t } = useTranslation();
  const { system } = useUnitSystem();
  const pd = plant.perenualData;

  const candidates: {
    key: string;
    icon: string;
    label: string;
    value: string | null;
  }[] = [
    {
      key: 'sun',
      icon: 'wb_sunny',
      label: t('plantDetail.gauges.sun'),
      value: pd
        ? formatXDataRange(pd.xSunlightHoursMin, pd.xSunlightHoursMax, ' h')
        : null,
    },
    {
      key: 'water',
      icon: 'water_drop',
      label: t('plantDetail.gauges.water'),
      value: plant.wateringNeedLevel
        ? t(
            `plantDetail.enumValues.wateringNeed.${plant.wateringNeedLevel}`,
            plant.wateringNeedLevel
          )
        : null,
    },
    {
      key: 'hardiness',
      icon: 'severe_cold',
      label: t('plantDetail.gauges.hardiness'),
      value: formatHardinessZone(
        plant.hardinessZoneMin,
        plant.hardinessZoneMax
      ),
    },
    {
      key: 'height',
      icon: 'height',
      label: t('plantDetail.gauges.height'),
      value: formatLength(plant.minHeightCm, plant.maxHeightCm, system),
    },
    {
      key: 'ph',
      icon: 'science',
      label: t('plantDetail.gauges.ph'),
      value: pd ? formatXDataRange(pd.xWateringPhMin, pd.xWateringPhMax) : null,
    },
    {
      key: 'temperature',
      icon: 'device_thermostat',
      label: t('plantDetail.gauges.temperature'),
      value: pd
        ? formatTemperature(
            pd.xWateringBasedTempMinC,
            pd.xWateringBasedTempMaxC,
            system
          )
        : null,
    },
    {
      key: 'spacing',
      icon: 'open_in_full',
      label: t('plantDetail.gauges.spacing'),
      value: pd
        ? formatSpacing(pd.xPlantSpacingValue, pd.xPlantSpacingUnit, system)
        : null,
    },
    {
      key: 'care',
      icon: 'build',
      label: t('plantDetail.gauges.care'),
      value: plant.careLevel
        ? t(
            `plantDetail.enumValues.careLevel.${plant.careLevel}`,
            plant.careLevel
          )
        : null,
    },
  ];

  const gauges: Gauge[] = candidates.filter((g): g is Gauge => g.value != null);

  if (gauges.length === 0) return null;

  return (
    <Box sx={{ mt: 2.5 }}>
      <Typography
        component="h2"
        sx={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: 'text.secondary',
          fontWeight: 700,
          mb: '10px',
        }}
      >
        {t('plantDetail.gauges.title')}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gap: '12px',
        }}
      >
        {gauges.map((g) => (
          <Box
            key={g.key}
            sx={{
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'borderSubtle',
              borderRadius: '12px',
              padding: '14px',
              display: 'flex',
              gap: '11px',
              alignItems: 'flex-start',
              boxShadow: '0 1px 3px rgba(27,94,58,0.05)',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                flexShrink: 0,
                bgcolor: 'brandTintBg',
                color: 'primary.main',
                borderRadius: '9px',
              }}
            >
              <Sym name={g.icon} size={21} color="inherit" />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'text.secondary',
                  fontWeight: 700,
                }}
              >
                {g.label}
              </Typography>
              <Typography
                sx={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'heading',
                  lineHeight: 1.2,
                  mt: '1px',
                }}
              >
                {g.value}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
