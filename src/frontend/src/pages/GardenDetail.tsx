import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import EditableNotes from '../components/EditableNotes';
import { useLanguage } from '../hooks/useLanguage';
import {
  fetchGarden,
  removePlantFromGarden,
  updatePlantNotes,
} from '../services/gardenApi';
import type { Garden } from '../types/Garden';
import { getPlantDisplayName } from '../utils/getPlantDisplayName';

export default function GardenDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
  const [garden, setGarden] = useState<Garden | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const loadGarden = async (signal?: AbortSignal) => {
    if (!id) return;
    try {
      const data = await fetchGarden(id, signal);
      if (mountedRef.current) {
        setGarden(data);
        setError(false);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError' && mountedRef.current) setError(true);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setGarden(null);
    loadGarden(controller.signal);
    return () => {
      mountedRef.current = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleRemovePlant = async (plantId: string) => {
    if (!id) return;
    try {
      setRemoveError(null);
      await removePlantFromGarden(id, plantId);
      if (mountedRef.current) {
        await loadGarden();
      }
    } catch {
      if (mountedRef.current) {
        setRemoveError(t('gardens.failedToRemove'));
      }
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
          {t('gardens.backToGardens')}
        </Button>
        <Typography color="text.secondary">{t('gardens.gardenNotFound')}</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Button component={RouterLink} to="/gardens" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>
        {t('gardens.backToGardens')}
      </Button>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h4" fontWeight={700} color="primary">
          {garden.name}
        </Typography>
        {/* SMA-6 Option A: plants enter a garden by being PLACED — the add
            dialog is gone; the primary action is the planner. */}
        <Button
          variant="contained"
          component={RouterLink}
          to={`/gardens/${garden.id}/planner`}
        >
          {t('gardens.planMyGarden')}
        </Button>
      </Box>
      {garden.description && (
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          {garden.description}
        </Typography>
      )}

      {removeError && (
        <Typography color="error" sx={{ mb: 2 }}>
          {removeError}
        </Typography>
      )}

      {garden.gardenPlants.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <Typography sx={{ mb: 2 }}>
            {t('gardens.emptyGarden')}
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Button
              variant="contained"
              component={RouterLink}
              to={`/gardens/${garden.id}/planner`}
            >
              {t('gardens.planMyGarden')}
            </Button>
            <Button variant="outlined" component={RouterLink} to="/library">
              {t('gardens.browseLibrary')}
            </Button>
          </Box>
        </Box>
      )}

      {garden.gardenPlants.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 3 }}>
          {garden.gardenPlants.map((gp) => {
            const plant = gp.plant;
            if (!plant) {
              return (
                <Card
                  key={gp.plantId}
                  variant="outlined"
                  sx={{ borderRadius: 3 }}
                >
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      {t('gardens.plantDataUnavailable')}
                    </Typography>
                  </CardContent>
                </Card>
              );
            }
            const displayName = getPlantDisplayName(plant, language);

            return (
              <Card
                key={gp.plantId}
                variant="outlined"
                sx={{ borderRadius: 3 }}
              >
                <CardContent>
                  <Typography variant="h6" fontWeight={600}>
                    {displayName}
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
                      // i18n token, never displayed raw (PlantType.Name doc) —
                      // same `plantTypes.*` resolution as every Library surface.
                      label={t(`plantTypes.${plant.plantType.name}`, plant.plantType.name)}
                      size="small"
                      color="primary"
                      variant="outlined"
                      sx={{ mb: 1 }}
                    />
                  )}
                  <EditableNotes
                    notes={gp.notes ?? null}
                    disabled={loading}
                    onSave={async (newNotes) => {
                      const updated = await updatePlantNotes(garden.id, gp.plantId, newNotes);
                      setGarden((prev) => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          gardenPlants: prev.gardenPlants.map((p) =>
                            p.plantId === gp.plantId
                              ? { ...p, notes: updated.notes ?? undefined }
                              : p,
                          ),
                        };
                      });
                    }}
                  />
                  <Box sx={{ mt: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={() => handleRemovePlant(gp.plantId)}
                      aria-label={t('gardens.removeFromGarden', { name: displayName })}
                    >
                      {t('gardens.removePlant')}
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
