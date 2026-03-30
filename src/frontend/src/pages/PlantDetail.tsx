import { useEffect, useState } from 'react';
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
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [plant, setPlant] = useState<Plant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    try {
      const data = await fetchGardens();
      setGardens(data);
    } catch {
      setGardens([]);
      setAddError('Failed to load gardens');
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
      let errorMsg = `${failed} garden(s) failed.`;
      if (successes > 0) errorMsg = `Added to ${successes} garden(s), but ${failed} failed.`;
      if (alreadyAdded > 0) errorMsg += ` ${alreadyAdded} already had this plant.`;
      setAddError(errorMsg);
    } else {
      let message = `Added to ${successes} garden(s).`;
      if (alreadyAdded > 0) message += ` ${alreadyAdded} already had this plant.`;
      setAddSuccess(message);
      setSelectedGardenIds(new Set());
      setTimeout(() => {
        setDialogOpen(false);
        setAddSuccess(null);
        setIsAdding(false);
      }, 2000);
      return;
    }
    setIsAdding(false);
  };

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

  const t = getTranslation(plant, language);

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

      <Box sx={{ mb: 3 }}>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<AddIcon />}
          onClick={openAddDialog}
        >
          Add to my garden
        </Button>
      </Box>

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
      {/* Add to garden dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add to garden</DialogTitle>
        <DialogContent>
          {gardensLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {!gardensLoading && gardens.length === 0 && !addError && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Typography sx={{ mb: 2 }}>You don&apos;t have any gardens yet.</Typography>
              <Button variant="contained" component={RouterLink} to="/gardens">
                Create a garden
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
                    secondary={`${garden.gardenPlants.length} plants`}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={selectedGardenIds.size === 0 || isAdding}
            onClick={handleAddToGarden}
          >
            {selectedGardenIds.size > 0
              ? `Add to ${selectedGardenIds.size} garden(s)`
              : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
