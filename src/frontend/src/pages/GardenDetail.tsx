import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useLanguage } from '../hooks/useLanguage';
import { addPlantToGarden, fetchGarden, removePlantFromGarden } from '../services/gardenApi';
import { fetchPlants } from '../services/plantApi';
import type { Garden } from '../types/Garden';
import type { Plant } from '../types/Plant';
import { getTranslation } from '../utils/getTranslation';

export default function GardenDetail() {
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
  const [garden, setGarden] = useState<Garden | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [availablePlants, setAvailablePlants] = useState<Plant[]>([]);
  const [plantsLoading, setPlantsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null);
  const [plantNotes, setPlantNotes] = useState('');
  const [addingPlant, setAddingPlant] = useState(false);
  const [addPlantError, setAddPlantError] = useState<string | null>(null);
  const [addPlantSuccess, setAddPlantSuccess] = useState<string | null>(null);

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
        setRemoveError('Failed to remove plant. Please try again.');
      }
    }
  };

  const openAddPlantDialog = async () => {
    setAddDialogOpen(true);
    setPlantsLoading(true);
    setAddPlantError(null);
    setAddPlantSuccess(null);
    setSelectedPlant(null);
    setPlantNotes('');
    setSearchQuery('');
    try {
      const allPlants = await fetchPlants();
      const gardenPlantIds = new Set(garden?.gardenPlants.map((gp) => gp.plantId) ?? []);
      setAvailablePlants(allPlants.filter((p) => !gardenPlantIds.has(p.id)));
    } catch {
      setAddPlantError('Failed to load plants');
    } finally {
      setPlantsLoading(false);
    }
  };

  const handleAddPlant = async () => {
    if (!selectedPlant || !garden || addingPlant) return;
    setAddingPlant(true);
    setAddPlantError(null);
    try {
      await addPlantToGarden(garden.id, selectedPlant.id, plantNotes || undefined);
      const name = getTranslation(selectedPlant, language)?.commonName ?? selectedPlant.scientificName;
      setAddPlantSuccess(`Added ${name}!`);
      setSelectedPlant(null);
      setPlantNotes('');
      if (mountedRef.current) await loadGarden();
      setTimeout(() => {
        setAddDialogOpen(false);
        setAddPlantSuccess(null);
      }, 1500);
    } catch (err) {
      if ((err as Error & { status?: number }).status === 409) {
        setAddPlantError('This plant is already in this garden');
      } else {
        setAddPlantError('Failed to add plant. Please try again.');
      }
    } finally {
      setAddingPlant(false);
    }
  };

  const filteredPlants = availablePlants.filter((p) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const commonName = getTranslation(p, language)?.commonName?.toLowerCase() ?? '';
    return commonName.includes(query) || p.scientificName.toLowerCase().includes(query);
  });

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

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h4" fontWeight={700} color="primary">
          {garden.name}
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openAddPlantDialog}>
          Add plants
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
            No plants in this garden yet. Add some from the library!
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openAddPlantDialog}>
              Add plants
            </Button>
            <Button variant="outlined" component={RouterLink} to="/library">
              Browse Library
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
                sx={{ borderRadius: 3 }}
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
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                      Notes: {gp.notes}
                    </Typography>
                  )}
                  <Box sx={{ mt: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={() => handleRemovePlant(gp.plantId)}
                      aria-label={`Remove ${t?.commonName ?? plant.scientificName} from garden`}
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
      {/* Add plant dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add a plant to this garden</DialogTitle>
        <DialogContent>
          {plantsLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {addPlantSuccess && (
            <Typography color="success.main" sx={{ mb: 2 }}>
              {addPlantSuccess}
            </Typography>
          )}

          {addPlantError && (
            <Typography color="error" sx={{ mb: 2 }}>
              {addPlantError}
            </Typography>
          )}

          {!plantsLoading && !addPlantSuccess && (
            <>
              <TextField
                placeholder="Search plants..."
                size="small"
                fullWidth
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                sx={{ mb: 2 }}
              />
              {filteredPlants.length > 0 ? (
                <List sx={{ maxHeight: 300, overflow: 'auto' }}>
                  {filteredPlants.map((p) => {
                    const pt = getTranslation(p, language);
                    return (
                      <ListItemButton
                        key={p.id}
                        selected={selectedPlant?.id === p.id}
                        onClick={() => setSelectedPlant(p)}
                      >
                        <ListItemText
                          primary={pt?.commonName ?? p.scientificName}
                          secondary={
                            <Typography
                              component="span"
                              variant="body2"
                              sx={{ fontStyle: 'italic' }}
                            >
                              {p.scientificName}
                            </Typography>
                          }
                        />
                        {p.plantType && (
                          <Chip label={p.plantType.name} size="small" variant="outlined" />
                        )}
                      </ListItemButton>
                    );
                  })}
                </List>
              ) : searchQuery ? (
                <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                  No plants match your search
                </Typography>
              ) : (
                <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                  All plants are already in this garden!
                </Typography>
              )}
              <TextField
                label="Notes (optional)"
                fullWidth
                multiline
                rows={2}
                inputProps={{ maxLength: 500 }}
                value={plantNotes}
                onChange={(e) => setPlantNotes(e.target.value)}
                sx={{ mt: 2 }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!selectedPlant || addingPlant}
            onClick={handleAddPlant}
          >
            Add to garden
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
