import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useLanguage } from '../hooks/useLanguage';
import { fetchGarden, removePlantFromGarden } from '../services/gardenApi';
import type { Garden } from '../types/Garden';
import { getTranslation } from '../utils/getTranslation';

export default function GardenDetail() {
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
  const [garden, setGarden] = useState<Garden | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadGarden = async (signal?: AbortSignal) => {
    if (!id) return;
    try {
      const data = await fetchGarden(id, signal);
      setGarden(data);
      setError(false);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadGarden(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleRemovePlant = async (plantId: string) => {
    if (!id) return;
    try {
      await removePlantFromGarden(id, plantId);
      loadGarden();
    } catch {
      setError(true);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error || !garden) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Button component={RouterLink} to="/gardens" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>
          Back to Gardens
        </Button>
        <Typography color="text.secondary">Garden not found.</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Button component={RouterLink} to="/gardens" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>
        Back to Gardens
      </Button>

      <Typography variant="h4" fontWeight={700} color="primary" sx={{ mb: 1 }}>
        {garden.name}
      </Typography>
      {garden.description && (
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          {garden.description}
        </Typography>
      )}

      {garden.gardenPlants.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <Typography sx={{ mb: 2 }}>
            No plants in this garden yet. Browse the library to add some!
          </Typography>
          <Button variant="contained" component={RouterLink} to="/library">
            Browse Library
          </Button>
        </Box>
      )}

      {garden.gardenPlants.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {garden.gardenPlants.map((gp) => {
            const plant = gp.plant;
            if (!plant) {
              return (
                <Card
                  key={gp.plantId}
                  variant="outlined"
                  sx={{ flex: '1 1 300px', minWidth: 0, borderRadius: 3 }}
                >
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      Plant data unavailable
                    </Typography>
                  </CardContent>
                </Card>
              );
            }
            const t = getTranslation(plant, language);

            return (
              <Card
                key={gp.plantId}
                variant="outlined"
                sx={{ flex: '1 1 300px', minWidth: 0, borderRadius: 3 }}
              >
                <CardContent>
                  <Typography variant="h6" fontWeight={600}>
                    {t?.commonName ?? plant.scientificName}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontStyle: 'italic', mb: 1 }}
                  >
                    {plant.scientificName}
                  </Typography>
                  {plant.plantType && (
                    <Chip
                      label={plant.plantType.name}
                      size="small"
                      color="primary"
                      variant="outlined"
                      sx={{ mb: 1 }}
                    />
                  )}
                  {gp.notes && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {gp.notes}
                    </Typography>
                  )}
                  <Box sx={{ mt: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={() => handleRemovePlant(gp.plantId)}
                    >
                      Remove
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </Container>
  );
}
