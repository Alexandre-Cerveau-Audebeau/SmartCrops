import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import AgricultureIcon from '@mui/icons-material/Agriculture';
import LocalFloristIcon from '@mui/icons-material/LocalFlorist';
import SpaIcon from '@mui/icons-material/Spa';
import YardIcon from '@mui/icons-material/Yard';
import type { Plant } from '../../types/Plant';
import { formatPeriod } from '../../utils/formatPeriod';

/** One stage of the lifecycle row: an icon disc (lit when the period is known) + label + value. */
function LifecycleStage({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <Box sx={{ textAlign: 'center', py: 1 }}>
      <Box
        sx={{
          mx: 'auto',
          width: 48,
          height: 48,
          borderRadius: '50%',
          bgcolor: value ? 'primary.main' : 'grey.300',
          color: value ? 'primary.contrastText' : 'text.secondary',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 1,
        }}
      >
        {icon}
      </Box>
      <Typography variant="body2" fontWeight={600}>
        {label}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 0.25 }}
      >
        {value ?? '—'}
      </Typography>
    </Box>
  );
}

/**
 * Lifecycle section for Plant Detail v2 (SMA-178 part A). Extracted from the
 * inline `lifecycle` card; the MUI `<Grid>` (banned for new code) is replaced
 * with a CSS-grid `Box` (2 columns mobile / 4 desktop). Renders the four stages
 * — sowing, growth, flowering, harvest — via `formatPeriod`, plus a
 * perennial/biennial note. Pure: the parent mounts it conditionally.
 */
export default function LifecycleSection({ plant }: { plant: Plant }) {
  const { t } = useTranslation();

  return (
    <Card
      id="lifecycle"
      variant="outlined"
      sx={{ mb: 3, borderRadius: 3, scrollMarginTop: '80px' }}
    >
      <CardContent>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
          {t('plantDetail.sections.lifecycle')}
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
            gap: 2,
          }}
        >
          <LifecycleStage
            icon={<SpaIcon />}
            label={t('plantDetail.lifecycle.stages.sowing')}
            value={formatPeriod(plant.sowingPeriod, t)}
          />
          {/* Growth has no period data source yet (no sowing/harvest-style field),
              so it is intentionally always null and renders as "—". */}
          <LifecycleStage
            icon={<YardIcon />}
            label={t('plantDetail.lifecycle.stages.growth')}
            value={null}
          />
          <LifecycleStage
            icon={<LocalFloristIcon />}
            label={t('plantDetail.lifecycle.stages.flowering')}
            value={formatPeriod(plant.perenualData?.floweringSeason ?? null, t)}
          />
          <LifecycleStage
            icon={<AgricultureIcon />}
            label={t('plantDetail.lifecycle.stages.harvest')}
            value={formatPeriod(
              plant.harvestPeriod ?? plant.perenualData?.harvestSeason ?? null,
              t
            )}
          />
        </Box>
        {plant.lifeCycle === 'Perennial' ||
        plant.lifeCycle === 'HerbaceousPerennial' ? (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 2, display: 'block' }}
          >
            {t('plantDetail.lifecycle.perennialNote')}
          </Typography>
        ) : plant.lifeCycle === 'Biennial' ? (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 2, display: 'block' }}
          >
            {t('plantDetail.lifecycle.biennialNote')}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
}
