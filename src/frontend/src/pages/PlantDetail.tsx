import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import AgricultureIcon from '@mui/icons-material/Agriculture';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import { fetchPlantById } from '../services/plantApi';
import type { Plant } from '../types/Plant';
import { getTranslation } from '../utils/getTranslation';

const languageLabels: Record<string, string> = {
  en: 'English',
  fr: 'Français',
};

export default function PlantDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [plant, setPlant] = useState<Plant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const controller = new AbortController();

    fetchPlantById(id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setPlant(data);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (err.status === 404) return;
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Failed to load plant');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [id]);

  if (!id) {
    return (
      <Container maxWidth="md" sx={{ pt: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          Missing plant id
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/library')}>
          Back to Library
        </Button>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ pt: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="md" sx={{ pt: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/library')}>
          Back to Library
        </Button>
      </Container>
    );
  }

  if (!plant) {
    return (
      <Container maxWidth="md" sx={{ pt: 4, textAlign: 'center' }}>
        <Typography color="text.secondary" sx={{ py: 8 }}>
          Plant not found.
        </Typography>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/library')}>
          Back to Library
        </Button>
      </Container>
    );
  }

  const t = getTranslation(plant);

  const conditions = [
    { icon: <WbSunnyIcon />, label: 'Sun Exposure', value: plant.sunExposure },
    { icon: <WaterDropIcon />, label: 'Water Needs', value: plant.waterNeeds },
    { icon: <CalendarMonthIcon />, label: 'Sowing Period', value: plant.sowingPeriod },
    { icon: <AgricultureIcon />, label: 'Harvest Period', value: plant.harvestPeriod },
  ].filter((c) => c.value);

  return (
    <Container maxWidth="md" sx={{ pt: 4, pb: 6 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/library')}
        sx={{ mb: 3 }}
      >
        Back to Library
      </Button>

      <Typography variant="h3" fontWeight={700} sx={{ mb: 0.5 }}>
        {t?.commonName ?? plant.scientificName}
      </Typography>
      <Typography variant="h6" color="text.secondary" sx={{ fontStyle: 'italic', mb: 2 }}>
        {plant.scientificName}
      </Typography>
      {plant.plantType && (
        <Chip
          label={plant.plantType.name}
          color="primary"
          variant="outlined"
          sx={{ mb: 3 }}
        />
      )}

      {t?.description && (
        <Typography variant="body1" sx={{ mb: 4, lineHeight: 1.8 }}>
          {t.description}
        </Typography>
      )}

      {conditions.length > 0 && (
        <Box
          sx={{
            bgcolor: 'rgba(76, 175, 120, 0.08)',
            borderRadius: 3,
            p: 3,
            mb: 4,
          }}
        >
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Growing Conditions
          </Typography>
          <Grid container spacing={2}>
            {conditions.map((c) => (
              <Grid key={c.label} size={{ xs: 12, sm: 6 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ color: 'primary.main' }}>{c.icon}</Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {c.label}
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {c.value}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {plant.translations.length > 0 && (
        <Box>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
            Available in
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {plant.translations.map((tr) => (
              <Chip
                key={tr.language}
                label={languageLabels[tr.language] ?? tr.language}
                size="small"
                variant="outlined"
              />
            ))}
          </Box>
        </Box>
      )}
    </Container>
  );
}
