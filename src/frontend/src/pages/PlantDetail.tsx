import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import Checkbox from '@mui/material/Checkbox';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import AgricultureIcon from '@mui/icons-material/Agriculture';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { addPlantToGarden, fetchGardens } from '../services/gardenApi';
import { fetchPlantById } from '../services/plantApi';
import type { Garden } from '../types/Garden';
import type { Plant } from '../types/Plant';
import { getTranslation } from '../utils/getTranslation';

const languageLabels: Record<string, string> = {
  en: 'English',
  fr: 'Français',
};

export default function PlantDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [plant, setPlant] = useState<Plant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [gardens, setGardens] = useState<Garden[]>([]);
  const [gardensLoading, setGardensLoading] = useState(false);
  const [selectedGardenIds, setSelectedGardenIds] = useState<Set<string>>(new Set());
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const toggleGarden = (id: string) => {
    setSelectedGardenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openAddDialog = async () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setDialogOpen(true);
    setGardensLoading(true);
    setAddError(null);
    setAddSuccess(null);
    setSelectedGardenIds(new Set());
    setGardens([]);
    setIsAdding(false);
    try {
      const data = await fetchGardens();
      setGardens(data);
    } catch {
      setGardens([]);
      setAddError(t('gardens.failedToLoadGardens'));
    } finally {
      setGardensLoading(false);
    }
  };

  const handleAddToGarden = async () => {
    if (selectedGardenIds.size === 0 || !plant) return;
    if (isAdding) return;
    setIsAdding(true);
    setAddError(null);
    const results: { gardenName: string; success: boolean; error?: string }[] = [];
    for (const gardenId of selectedGardenIds) {
      const garden = gardens.find((g) => g.id === gardenId);
      try {
        await addPlantToGarden(gardenId, plant.id);
        results.push({ gardenName: garden?.name ?? '', success: true });
      } catch (err) {
        const status = (err as Error & { status?: number }).status;
        results.push({
          gardenName: garden?.name ?? '',
          success: false,
          error: status === 409 ? 'already added' : 'failed',
        });
      }
    }
    const successes = results.filter((r) => r.success).length;
    const alreadyAdded = results.filter((r) => r.error === 'already added').length;
    const failed = results.filter((r) => r.error === 'failed').length;

    if (failed > 0) {
      let errorMsg = successes > 0
        ? t('gardens.addedButFailed', { count: successes, failed })
        : t('gardens.failedCount', { count: failed });
      if (alreadyAdded > 0) errorMsg += ` ${t('gardens.addedWithExisting', { count: alreadyAdded })}`;
      setAddError(errorMsg);
    } else if (successes > 0) {
      let message = t('gardens.addedToCount', { count: successes });
      if (alreadyAdded > 0) message += ` ${t('gardens.addedWithExisting', { count: alreadyAdded })}`;
      setAddSuccess(message);
      setSelectedGardenIds(new Set());
      closeTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setDialogOpen(false);
        setAddSuccess(null);
        setIsAdding(false);
        closeTimerRef.current = null;
      }, 2000);
      return;
    } else if (alreadyAdded > 0) {
      setAddError(t('gardens.addedWithExisting', { count: alreadyAdded }));
    }
    setIsAdding(false);
  };

  useEffect(() => {
    mountedRef.current = true;
    setPlant(null);
    setError(null);
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const controller = new AbortController();

    fetchPlantById(id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setPlant(data);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (err.status === 404) return;
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : t('library.error'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      mountedRef.current = false;
      controller.abort();
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!id) {
    return (
      <Container maxWidth="md" sx={{ pt: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {t('library.missingPlantId')}
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/library')}>
          {t('library.backToLibrary')}
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
          {t('library.backToLibrary')}
        </Button>
      </Container>
    );
  }

  if (!plant) {
    return (
      <Container maxWidth="md" sx={{ pt: 4, textAlign: 'center' }}>
        <Typography color="text.secondary" sx={{ py: 8 }}>
          {t('library.plantNotFound')}
        </Typography>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/library')}>
          {t('library.backToLibrary')}
        </Button>
      </Container>
    );
  }

  const tr = getTranslation(plant, language);

  const conditions = [
    { icon: <WbSunnyIcon />, label: t('library.sunExposure'), value: plant.sunExposure ? t(`plantValues.${plant.sunExposure}`, plant.sunExposure) : undefined },
    { icon: <WaterDropIcon />, label: t('library.waterNeeds'), value: plant.waterNeeds ? t(`plantValues.${plant.waterNeeds}`, plant.waterNeeds) : undefined },
    { icon: <CalendarMonthIcon />, label: t('library.sowingPeriod'), value: plant.sowingPeriod },
    { icon: <AgricultureIcon />, label: t('library.harvestPeriod'), value: plant.harvestPeriod },
  ].filter((c) => c.value);

  return (
    <Container maxWidth="md" sx={{ pt: 4, pb: 6 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/library')}
        sx={{ mb: 3 }}
      >
        {t('library.backToLibrary')}
      </Button>

      <Typography variant="h3" fontWeight={700} sx={{ mb: 0.5 }}>
        {tr?.commonName ?? plant.scientificName}
      </Typography>
      <Typography variant="h6" color="text.secondary" sx={{ fontStyle: 'italic', mb: 2 }}>
        {plant.scientificName}
      </Typography>
      {plant.plantType && (
        <Chip
          label={t(`plantTypes.${plant.plantType.name}`, plant.plantType.name)}
          color="primary"
          variant="outlined"
          sx={{ mb: 3 }}
        />
      )}

      <Box sx={{ mb: 3 }}>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<AddIcon />}
          onClick={openAddDialog}
        >
          {t('library.addToGarden')}
        </Button>
      </Box>

      {tr?.description && (
        <Typography variant="body1" sx={{ mb: 4, lineHeight: 1.8 }}>
          {tr.description}
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
            {t('library.growingConditions')}
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
            {t('library.availableIn')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {plant.translations.map((translation) => (
              <Chip
                key={translation.language}
                label={languageLabels[translation.language] ?? translation.language}
                size="small"
                variant="outlined"
              />
            ))}
          </Box>
        </Box>
      )}
      {/* Add to garden dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('library.addToGardenDialog')}</DialogTitle>
        <DialogContent>
          {gardensLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {!gardensLoading && gardens.length === 0 && !addError && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Typography sx={{ mb: 2 }}>{t('library.noGardensYet')}</Typography>
              <Button variant="contained" component={RouterLink} to="/gardens">
                {t('library.createAGarden')}
              </Button>
            </Box>
          )}

          {addSuccess && (
            <Typography color="success.main" sx={{ mb: 2 }}>
              {addSuccess}
            </Typography>
          )}

          {addError && (
            <Typography color="error" sx={{ mb: 2 }}>
              {addError}
            </Typography>
          )}

          {!gardensLoading && gardens.length > 0 && !addSuccess && (
            <List>
              {gardens.map((garden) => (
                <ListItemButton
                  key={garden.id}
                  onClick={() => toggleGarden(garden.id)}
                >
                  <Checkbox
                    checked={selectedGardenIds.has(garden.id)}
                    edge="start"
                    tabIndex={-1}
                    disableRipple
                  />
                  <ListItemText
                    primary={garden.name}
                    secondary={t('gardens.plantsCount', { count: garden.gardenPlants.length })}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('gardens.cancel')}</Button>
          <Button
            variant="contained"
            disabled={selectedGardenIds.size === 0 || isAdding}
            onClick={handleAddToGarden}
          >
            {selectedGardenIds.size > 0
              ? t('library.addToCount', { count: selectedGardenIds.size })
              : t('library.add')}

          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
