import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Snackbar from '@mui/material/Snackbar';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import DeleteGardenDialog from '../components/Garden/DeleteGardenDialog';
import { useGardens } from '../hooks/useGardens';
import { useLanguage } from '../hooks/useLanguage';
import { createGarden, updateGarden } from '../services/gardenApi';
import type { GardenListItem } from '../types/Garden';
import { getPlantDisplayName } from '../utils/getPlantDisplayName';

/**
 * Router state the planner posts when it navigates here after deleting the
 * garden (SMA-18 lot 1) — the same location.state channel PlantDetail reads
 * for its back link. Consumed once at mount, then erased with a replace so a
 * refresh never replays the toast.
 */
type MyGardensNavState = { toast?: 'gardenDeleted' } | null;

export default function MyGardens() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const navState = location.state as MyGardensNavState;
  // ONE toast kind today. The planner's displayedToast rationale, both
  // halves: the open flag is separate so the copy survives the Snackbar's
  // exit transition, and `toastSeq` keys the Snackbar so a second deletion
  // inside the first toast's window remounts it with a FULL auto-hide
  // window (MUI restarts the timer on `open`, not on a same-value write).
  const [toastSeq, setToastSeq] = useState(() =>
    navState?.toast === 'gardenDeleted' ? 1 : 0
  );
  const [toastOpen, setToastOpen] = useState(
    () => navState?.toast === 'gardenDeleted'
  );
  useEffect(() => {
    if (navState?.toast) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [navState, navigate, location.pathname]);
  // SMA-421: the list fetch (locale re-fetch, stale-response guard,
  // post-mutation refresh) lives in useGardens — the hook carries the
  // SMA-155 / SMA-288 invariants this page used to hold inline.
  const { gardens, loading, loadError, refetch } = useGardens(language);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());
  const [mutationError, setMutationError] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newGardenName, setNewGardenName] = useState('');
  const [newGardenDescription, setNewGardenDescription] = useState('');

  const [editingGarden, setEditingGarden] = useState<GardenListItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // The deletion target OUTLIVES the dialog's open flag: every close path
  // only flips `deleteOpen`, so the fading dialog keeps its name, count and
  // (disarmed) button instead of collapsing to ''/0 mid-transition. The next
  // opening replaces the target.
  const [deleteTarget, setDeleteTarget] = useState<GardenListItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleCreate = async () => {
    if (isMutating) return;
    setIsMutating(true);
    setMutationError(false);
    try {
      await createGarden(newGardenName, newGardenDescription || undefined);
      setCreateDialogOpen(false);
      setNewGardenName('');
      setNewGardenDescription('');
      refetch();
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
      refetch();
    } catch {
      setMutationError(true);
    } finally {
      setIsMutating(false);
    }
  };

  const openDeleteDialog = (garden: GardenListItem) => {
    setDeleteTarget(garden);
    setDeleteOpen(true);
  };

  // The dialog owns the DELETE call and its pending/error states (SMA-18
  // lot 1); the page only reacts to the confirmed deletion.
  const handleDeleted = () => {
    setDeleteOpen(false);
    setToastSeq((seq) => seq + 1);
    setToastOpen(true);
    refetch();
  };

  const openEditDialog = (garden: GardenListItem) => {
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
              sx={{
                borderRadius: 3,
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.2s ease',
                '&:hover': {
                  boxShadow: 4,
                  borderColor: 'primary.main',
                  transform: 'scale(1.005)',
                },
              }}
            >
              {/* Edit / Delete buttons — top right */}
              <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1, display: 'flex', gap: 0.5 }}>
                <IconButton
                  size="small"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEditDialog(garden); }}
                  aria-label={`${t('gardens.edit')} ${garden.name}`}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); openDeleteDialog(garden); }}
                  aria-label={`${t('gardens.delete')} ${garden.name}`}
                  sx={{ color: 'error.main' }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>

              {/* Chevron indicator */}
              <ChevronRightIcon sx={{
                position: 'absolute',
                bottom: 12,
                right: 8,
                color: 'text.disabled',
                pointerEvents: 'none',
              }} />

              {/* Clickable area — navigates to planner */}
              <CardActionArea component={RouterLink} to={`/gardens/${garden.id}/planner`} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                <CardContent sx={{ flex: 1, pr: 5 }}>
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
                    <Button
                      variant="text"
                      size="small"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleDescription(garden.id); }}
                      sx={{ mt: 0.5, mb: 1, p: 0, minWidth: 0, fontSize: '0.8rem' }}
                    >
                      {expandedDescriptions.has(garden.id) ? t('gardens.seeLess') : t('gardens.seeMore')}
                    </Button>
                  )}
                  {/* Counter + preview = DISTINCT plants actually placed in the
                      map (SMA-6) — names through the shared Library resolver. */}
                  <Chip
                    label={t('gardens.plantsCount', { count: garden.plants.length })}
                    size="small"
                    variant="outlined"
                  />
                  {garden.plants.length > 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {garden.plants
                        .slice(0, 3)
                        .map((plant) => getPlantDisplayName(plant, language))
                        .join(', ')}
                      {garden.plants.length > 3 &&
                        ` ${t('gardens.more', { count: garden.plants.length - 3 })}`}
                    </Typography>
                  )}
                </CardContent>
              </CardActionArea>
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

      {/* Delete confirm (SMA-18 lot 1): type-the-name brake. The list DTO
          only knows the DISTINCT placed plants, so that is the one count the
          body can honestly name here. */}
      <DeleteGardenDialog
        open={deleteOpen}
        gardenId={deleteTarget?.id ?? ''}
        gardenName={deleteTarget?.name ?? ''}
        summary={{ kind: 'list', plants: deleteTarget?.plants.length ?? 0 }}
        onClose={() => setDeleteOpen(false)}
        onDeleted={handleDeleted}
      />

      {/* Deletion feedback — from this page's own dialog or from the planner
          (router state). Same Snackbar/Alert idiom as the planner's toast. */}
      <Snackbar
        key={toastSeq}
        open={toastOpen}
        autoHideDuration={6000}
        onClose={() => setToastOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setToastOpen(false)}
          severity="success"
          variant="filled"
          sx={{ width: '100%' }}
        >
          {t('gardens.deleteDialog.successToast')}
        </Alert>
      </Snackbar>
    </Container>
  );
}
