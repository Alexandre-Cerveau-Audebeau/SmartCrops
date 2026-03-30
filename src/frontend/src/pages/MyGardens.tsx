import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { useLanguage } from '../hooks/useLanguage';
import { createGarden, deleteGarden, fetchGardens, updateGarden } from '../services/gardenApi';
import type { Garden } from '../types/Garden';
import { getTranslation } from '../utils/getTranslation';

export default function MyGardens() {
  const { language } = useLanguage();
  const [gardens, setGardens] = useState<Garden[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());
  const [mutationError, setMutationError] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newGardenName, setNewGardenName] = useState('');
  const [newGardenDescription, setNewGardenDescription] = useState('');

  const [editingGarden, setEditingGarden] = useState<Garden | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const [deleteConfirmGarden, setDeleteConfirmGarden] = useState<Garden | null>(null);

  const loadGardens = async (signal?: AbortSignal) => {
    try {
      const data = await fetchGardens(signal);
      setGardens(data);
      setLoadError(false);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadGardens(controller.signal);
    return () => controller.abort();
  }, []);

  const handleCreate = async () => {
    if (isMutating) return;
    setIsMutating(true);
    setMutationError(false);
    try {
      await createGarden(newGardenName, newGardenDescription || undefined);
      setCreateDialogOpen(false);
      setNewGardenName('');
      setNewGardenDescription('');
      loadGardens();
    } catch {
      setMutationError(true);
    } finally {
      setIsMutating(false);
    }
  };

  const handleEdit = async () => {
    if (!editingGarden || isMutating) return;
    setIsMutating(true);
    setMutationError(false);
    try {
      await updateGarden(editingGarden.id, editName, editDescription || undefined);
      setEditingGarden(null);
      loadGardens();
    } catch {
      setMutationError(true);
    } finally {
      setIsMutating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmGarden || isMutating) return;
    setIsMutating(true);
    setMutationError(false);
    try {
      await deleteGarden(deleteConfirmGarden.id);
      setDeleteConfirmGarden(null);
      loadGardens();
    } catch {
      setMutationError(true);
    } finally {
      setIsMutating(false);
    }
  };

  const openEditDialog = (garden: Garden) => {
    setEditingGarden(garden);
    setEditName(garden.name);
    setEditDescription(garden.description ?? '');
  };

  const toggleDescription = (gardenId: string) => {
    setExpandedDescriptions((prev) => {
      const next = new Set(prev);
      if (next.has(gardenId)) next.delete(gardenId);
      else next.add(gardenId);
      return next;
    });
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" fontWeight={700} color="primary">
          My Gardens
        </Typography>
        <Button variant="contained" onClick={() => setCreateDialogOpen(true)}>
          Create Garden
        </Button>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" width={300} height={160} sx={{ borderRadius: 3 }} />
          ))}
        </Box>
      )}

      {loadError && (
        <Typography color="text.secondary">
          Unable to load gardens. Please try again later.
        </Typography>
      )}

      {mutationError && (
        <Typography color="error" sx={{ mb: 2 }}>
          An error occurred. Please try again.
        </Typography>
      )}

      {!loading && !loadError && gardens.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <Typography sx={{ mb: 2 }}>
            You don&apos;t have any gardens yet. Create your first garden!
          </Typography>
          <Button variant="contained" onClick={() => setCreateDialogOpen(true)}>
            Create Garden
          </Button>
        </Box>
      )}

      {!loading && gardens.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 3 }}>
          {gardens.map((garden) => (
            <Card
              key={garden.id}
              variant="outlined"
              sx={{ borderRadius: 3 }}
            >
              <CardContent>
                <Typography variant="h6" fontWeight={600}>
                  {garden.name}
                </Typography>
                {garden.description && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={
                      expandedDescriptions.has(garden.id)
                        ? { mb: 0.5 }
                        : {
                            mb: 0.5,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                          }
                    }
                  >
                    {garden.description}
                  </Typography>
                )}
                {garden.description && garden.description.length > 80 && (
                  <Typography
                    variant="body2"
                    color="primary"
                    sx={{ cursor: 'pointer', mt: 0.5, mb: 1, fontSize: '0.8rem' }}
                    onClick={() => toggleDescription(garden.id)}
                  >
                    {expandedDescriptions.has(garden.id) ? 'See less' : 'See more'}
                  </Typography>
                )}
                <Chip
                  label={`${garden.gardenPlants.length} plants`}
                  size="small"
                  variant="outlined"
                />
                {garden.gardenPlants.length > 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {garden.gardenPlants
                      .slice(0, 3)
                      .map((gp) => {
                        if (!gp.plant) return 'Unknown';
                        const t = getTranslation(gp.plant, language);
                        return t?.commonName || gp.plant.translations?.[0]?.commonName || gp.plant.scientificName;
                      })
                      .join(', ')}
                    {garden.gardenPlants.length > 3 &&
                      ` +${garden.gardenPlants.length - 3} more`}
                  </Typography>
                )}
              </CardContent>
              <CardActions>
                <Button size="small" component={RouterLink} to={`/gardens/${garden.id}`}>
                  View
                </Button>
                <IconButton
                  size="small"
                  onClick={() => openEditDialog(garden)}
                  aria-label={`Edit garden ${garden.name}`}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => setDeleteConfirmGarden(garden)}
                  aria-label={`Delete garden ${garden.name}`}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </CardActions>
            </Card>
          ))}
        </Box>
      )}

      {/* Create Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create a new garden</DialogTitle>
        <DialogContent>
          <TextField
            label="Name"
            fullWidth
            required
            inputProps={{ maxLength: 100 }}
            value={newGardenName}
            onChange={(e) => setNewGardenName(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            label="Description"
            fullWidth
            multiline
            rows={3}
            inputProps={{ maxLength: 500 }}
            value={newGardenDescription}
            onChange={(e) => setNewGardenDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={isMutating || !newGardenName.trim()} onClick={handleCreate}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={editingGarden !== null}
        onClose={() => setEditingGarden(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit garden</DialogTitle>
        <DialogContent>
          <TextField
            label="Name"
            fullWidth
            required
            inputProps={{ maxLength: 100 }}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            label="Description"
            fullWidth
            multiline
            rows={3}
            inputProps={{ maxLength: 500 }}
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingGarden(null)}>Cancel</Button>
          <Button variant="contained" disabled={isMutating || !editName.trim()} onClick={handleEdit}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirmGarden !== null} onClose={() => setDeleteConfirmGarden(null)}>
        <DialogTitle>Delete garden?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete &apos;{deleteConfirmGarden?.name}&apos;? This action
            cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmGarden(null)}>Cancel</Button>
          <Button variant="contained" color="error" disabled={isMutating} onClick={handleDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
