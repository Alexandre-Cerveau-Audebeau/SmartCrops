import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import HandymanIcon from '@mui/icons-material/Handyman';
import HeightIcon from '@mui/icons-material/Height';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import ScienceIcon from '@mui/icons-material/Science';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
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
  icon: ReactNode;
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
 */
export default function PlantHeroGauges({ plant }: { plant: Plant }) {
  const { t } = useTranslation();
  const { system } = useUnitSystem();
  const pd = plant.perenualData;

  const candidates: {
    key: string;
    icon: ReactNode;
    label: string;
    value: string | null;
  }[] = [
    {
      key: 'sun',
      icon: <WbSunnyIcon sx={{ fontSize: 21 }} />,
      label: t('plantDetail.gauges.sun'),
      value: pd
        ? formatXDataRange(pd.xSunlightHoursMin, pd.xSunlightHoursMax, ' h')
        : null,
    },
    {
      key: 'water',
      icon: <WaterDropIcon sx={{ fontSize: 21 }} />,
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
      icon: <AcUnitIcon sx={{ fontSize: 21 }} />,
      label: t('plantDetail.gauges.hardiness'),
      value: formatHardinessZone(
        plant.hardinessZoneMin,
        plant.hardinessZoneMax
      ),
    },
    {
      key: 'height',
      icon: <HeightIcon sx={{ fontSize: 21 }} />,
      label: t('plantDetail.gauges.height'),
      value: formatLength(plant.minHeightCm, plant.maxHeightCm, system),
    },
    {
      key: 'ph',
      icon: <ScienceIcon sx={{ fontSize: 21 }} />,
      label: t('plantDetail.gauges.ph'),
      value: pd ? formatXDataRange(pd.xWateringPhMin, pd.xWateringPhMax) : null,
    },
    {
      key: 'temperature',
      icon: <ThermostatIcon sx={{ fontSize: 21 }} />,
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
      icon: <OpenInFullIcon sx={{ fontSize: 21 }} />,
      label: t('plantDetail.gauges.spacing'),
      value: pd
        ? formatSpacing(pd.xPlantSpacingValue, pd.xPlantSpacingUnit, system)
        : null,
    },
    {
      key: 'care',
      icon: <HandymanIcon sx={{ fontSize: 21 }} />,
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
          color: '#7a857f',
          fontWeight: 700,
          mb: 1.25,
        }}
      >
        {t('plantDetail.gauges.title')}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gap: 1.5,
        }}
      >
        {gauges.map((g) => (
          <Box
            key={g.key}
            sx={{
              bgcolor: '#fff',
              border: '1px solid #ECF1EA',
              borderRadius: 3,
              p: 1.75,
              display: 'flex',
              gap: 1.25,
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
                bgcolor: '#EAF5EE',
                borderRadius: 2,
                color: 'primary.main',
              }}
            >
              {g.icon}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#9aa5a0',
                  fontWeight: 700,
                }}
              >
                {g.label}
              </Typography>
              <Typography
                sx={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#1B5E3A',
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
