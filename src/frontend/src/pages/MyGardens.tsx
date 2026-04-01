import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
          {t('gardens.title')}
        </Typography>
        <Button variant="contained" onClick={() => setCreateDialogOpen(true)}>
          {t('gardens.createGarden')}
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
          {t('gardens.error')}
        </Typography>
      )}

      {mutationError && (
        <Typography color="error" sx={{ mb: 2 }}>
          {t('gardens.mutationError')}
        </Typography>
      )}

      {!loading && !loadError && gardens.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <Typography sx={{ mb: 2 }}>
            {t('gardens.noGardens')}
          </Typography>
          <Button variant="contained" onClick={() => setCreateDialogOpen(true)}>
            {t('gardens.createGarden')}
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
                    {expandedDescriptions.has(garden.id) ? t('gardens.seeLess') : t('gardens.seeMore')}
                  </Typography>
                )}
                <Chip
                  label={`${garden.gardenPlants.length} ${t('gardens.plants')}`}
                  size="small"
                  variant="outlined"
                />
                {garden.gardenPlants.length > 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {garden.gardenPlants
                      .slice(0, 3)
                      .map((gp) => {
                        if (!gp.plant) return 'Unknown';
                        const tr = getTranslation(gp.plant, language);
                        return tr?.commonName || gp.plant.translations?.[0]?.commonName || gp.plant.scientificName;
                      })
                      .join(', ')}
                    {garden.gardenPlants.length > 3 &&
                      ` ${t('gardens.more', { count: garden.gardenPlants.length - 3 })}`}
                  </Typography>
                )}
              </CardContent>
              <CardActions>
                <Button size="small" component={RouterLink} to={`/gardens/${garden.id}`}>
                  {t('gardens.view')}
                </Button>
                <IconButton
                  size="small"
                  onClick={() => openEditDialog(garden)}
                  aria-label={`${t('gardens.edit')} ${garden.name}`}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => setDeleteConfirmGarden(garden)}
                  aria-label={`${t('gardens.delete')} ${garden.name}`}
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
        <DialogTitle>{t('gardens.createDialogTitle')}</DialogTitle>
        <DialogContent>
          <TextField
            label={t('gardens.gardenName')}
            fullWidth
            required
            inputProps={{ maxLength: 100 }}
            value={newGardenName}
            onChange={(e) => setNewGardenName(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            label={t('gardens.description')}
            fullWidth
            multiline
            rows={3}
            inputProps={{ maxLength: 500 }}
            value={newGardenDescription}
            onChange={(e) => setNewGardenDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>{t('gardens.cancel')}</Button>
          <Button variant="contained" disabled={isMutating || !newGardenName.trim()} onClick={handleCreate}>
            {t('gardens.create')}
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
        <DialogTitle>{t('gardens.editDialogTitle')}</DialogTitle>
        <DialogContent>
          <TextField
            label={t('gardens.gardenName')}
            fullWidth
            required
            inputProps={{ maxLength: 100 }}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            label={t('gardens.description')}
            fullWidth
            multiline
            rows={3}
            inputProps={{ maxLength: 500 }}
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingGarden(null)}>{t('gardens.cancel')}</Button>
          <Button variant="contained" disabled={isMutating || !editName.trim()} onClick={handleEdit}>
            {t('gardens.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirmGarden !== null} onClose={() => setDeleteConfirmGarden(null)}>
        <DialogTitle>{t('gardens.deleteDialogTitle')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('gardens.deleteConfirm', { name: deleteConfirmGarden?.name })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmGarden(null)}>{t('gardens.cancel')}</Button>
          <Button variant="contained" color="error" disabled={isMutating} onClick={handleDelete}>
            {t('gardens.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
