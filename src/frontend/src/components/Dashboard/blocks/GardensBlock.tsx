import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import YardOutlinedIcon from '@mui/icons-material/YardOutlined';
import DeleteGardenDialog from '../../Garden/DeleteGardenDialog';
import DashboardBlock from '../DashboardBlock';
import InviteState from '../InviteState';
import { updateGarden } from '../../../services/gardenApi';
import { DASHBOARD_TYPE } from '../../../theme/dashboardTokens';
import type { DashboardSize } from '../../../types/Dashboard';
import type { GardenListItem } from '../../../types/Garden';
import { formatRelativeDate } from '../../../utils/formatRelativeDate';
import { getPlantDisplayName } from '../../../utils/getPlantDisplayName';

/** Rows a Medium card shows before it defers the rest to "+N" (_spec.md 4). */
const MEDIUM_ROWS = 3;

interface Props {
  size: DashboardSize;
  editing?: boolean;
  gardens: GardenListItem[];
  loading: boolean;
  loadError: boolean;
  language: string;
  /** Opens the page create dialog - the same one the header button opens. */
  onCreateClick: () => void;
  /** Re-runs the gardens fetch after a failed load or a rename. */
  onChanged: () => void;
  /** A deletion the backend confirmed: the page toasts and re-fetches. */
  onDeleted: () => void;
  /** "+N" - the rest of the list is reached by growing the widget. */
  onExpand: () => void;
}

/**
 * SMA-336 PR 1/5 - the ONE widget of this lot fed with real data (orchestrator
 * decision R1, resolving the STOP of the first pass): the dashboard replaces
 * `MyGardens` on `/gardens`, and that page held the only link to the planner in
 * the whole product. Shipping it as an invitation would have made every garden
 * - and the planner with it - unreachable at merge.
 *
 * The widget therefore renders exactly what `MyGardens` rendered: the cards,
 * the distinct-placed-plants count and its preview names, the rename, the
 * type-the-name deletion, and the chevron into the planner. Deliberately NOT
 * here, and left to PR 2: the plan thumbnail, occupancy, dominant exposure, the
 * WEATHER and HARVEST columns, the full comparison table and the
 * `GET /api/dashboard` aggregate.
 *
 * The frozen design also gives each card a garden-type chip and its dimensions
 * (_spec.md 7). `GET /api/gardens` serves neither (`GardenListItemResponse`:
 * id, name, description, dates, plants), and fetching them would mean the very
 * data plumbing this PR must not do - so the cards carry what the list DTO
 * honestly holds.
 */
export default function GardensBlock({
  size,
  editing,
  gardens,
  loading,
  loadError,
  language,
  onCreateClick,
  onChanged,
  onDeleted,
  onExpand,
}: Props) {
  const { t } = useTranslation();

  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(
    new Set()
  );
  const [mutationError, setMutationError] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const [editingGarden, setEditingGarden] = useState<GardenListItem | null>(
    null
  );
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // The deletion target OUTLIVES the dialog open flag (the MyGardens idiom):
  // every close path only flips `deleteOpen`, so the fading dialog keeps its
  // name, count and (disarmed) button instead of collapsing mid-transition.
  const [deleteTarget, setDeleteTarget] = useState<GardenListItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  /**
   * EVERY way the rename dialog closes (round 1, E9 / G4). Clearing the error
   * here is the point: it is raised inside a modal, so leaving it behind put a
   * failure message on the widget frame with no subject left to explain it.
   */
  const closeEditDialog = () => {
    // Not while the rename is in flight (round 2, E'5 / N2). The Save button is
    // disabled, but the backdrop and Escape still reach this handler: closing
    // there unmounts the Dialog the error Alert lives in, so a rename that then
    // fails is reported nowhere at all. Same contract as `closeCreateDialog` in
    // GardensDashboard.tsx — the widget and the page close the same way.
    if (isMutating) return;
    setEditingGarden(null);
    setMutationError(false);
  };

  const handleEdit = async () => {
    if (!editingGarden || isMutating) return;
    setIsMutating(true);
    setMutationError(false);
    try {
      await updateGarden(
        editingGarden.id,
        editName,
        editDescription || undefined
      );
      // Clears the state directly: `isMutating` is still true here (it falls in
      // the `finally`), so the guarded close would refuse to run.
      setEditingGarden(null);
      setMutationError(false);
      onChanged();
    } catch {
      setMutationError(true);
    } finally {
      setIsMutating(false);
    }
  };

  const openEditDialog = (garden: GardenListItem) => {
    setEditingGarden(garden);
    setEditName(garden.name);
    setEditDescription(garden.description ?? '');
    setMutationError(false);
  };

  const openDeleteDialog = (garden: GardenListItem) => {
    setDeleteTarget(garden);
    setDeleteOpen(true);
  };

  const toggleDescription = (gardenId: string) => {
    setExpandedDescriptions((previous) => {
      const next = new Set(previous);
      if (next.has(gardenId)) next.delete(gardenId);
      else next.add(gardenId);
      return next;
    });
  };

  // Most recently touched garden - the Small card subject, and where its arrow
  // leads. `updatedAt` is the one freshness signal the list DTO carries.
  const lastModified = gardens.reduce<GardenListItem | null>(
    (latest, garden) =>
      !latest || garden.updatedAt > latest.updatedAt ? garden : latest,
    null
  );

  const plannerPath = (garden: GardenListItem) =>
    `/gardens/${garden.id}/planner`;

  const countChip = (
    <Chip
      label={t('dashboard.blocks.gardens.count', { count: gardens.length })}
      size="small"
      variant="outlined"
      sx={{ height: DASHBOARD_TYPE.chipHeight, fontSize: DASHBOARD_TYPE.chip }}
    />
  );

  const smallBody = () => (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <Box>
        <Typography
          sx={{ fontSize: DASHBOARD_TYPE.big, fontWeight: 800, lineHeight: 1.1 }}
        >
          {gardens.length}
        </Typography>
        <Typography
          sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary' }}
        >
          {t('dashboard.blocks.gardens.count', { count: gardens.length })}
        </Typography>
      </Box>
      {lastModified && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <Typography
            sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary' }}
          >
            {t('dashboard.blocks.gardens.lastModified', {
              when: formatRelativeDate(
                new Date(lastModified.updatedAt),
                new Date(),
                language,
                'short'
              ),
            })}
          </Typography>
          <IconButton
            component={RouterLink}
            to={plannerPath(lastModified)}
            size="small"
            aria-label={t('dashboard.blocks.gardens.openLast')}
          >
            <ChevronRightIcon />
          </IconButton>
        </Box>
      )}
    </Box>
  );

  const mediumBody = () => {
    const shown = gardens.slice(0, MEDIUM_ROWS);
    const remaining = gardens.length - shown.length;
    return (
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-evenly',
          gap: '8px',
        }}
      >
        {shown.map((garden) => (
          <Box
            key={garden.id}
            component={RouterLink}
            to={plannerPath(garden)}
            aria-label={t('dashboard.blocks.gardens.open', {
              name: garden.name,
            })}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              minHeight: 44,
              px: '8px',
              borderRadius: '8px',
              textDecoration: 'none',
              color: 'inherit',
              '&:hover': { backgroundColor: 'surfaceSubtle' },
            }}
          >
            <Typography
              sx={{
                fontSize: DASHBOARD_TYPE.gardenName,
                fontWeight: 700,
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {garden.name}
            </Typography>
            <Chip
              label={t('gardens.plantsCount', { count: garden.plants.length })}
              size="small"
              variant="outlined"
              sx={{
                height: DASHBOARD_TYPE.chipHeight,
                fontSize: DASHBOARD_TYPE.chip,
              }}
            />
            <ChevronRightIcon fontSize="small" sx={{ color: 'text.disabled' }} />
          </Box>
        ))}
        {remaining > 0 && (
          <Button
            size="small"
            onClick={onExpand}
            sx={{ alignSelf: 'flex-start', fontSize: DASHBOARD_TYPE.link }}
          >
            {t('dashboard.blocks.gardens.more', { count: remaining })}
          </Button>
        )}
        <Button
          size="small"
          onClick={onCreateClick}
          sx={{ alignSelf: 'flex-start', fontSize: DASHBOARD_TYPE.link }}
        >
          {t('gardens.createGarden')}
        </Button>
      </Box>
    );
  };

  const largeBody = () => (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          // Rows are centred rather than packed at the top (round 1, V3): two
          // gardens in a Large card left the bottom half empty. When the list
          // outgrows the card the parent scrolls, as before.
          alignContent: 'center',
          minHeight: '100%',
          gap: '12px',
        }}
      >
        {gardens.map((garden) => (
          <Card
            key={garden.id}
            variant="outlined"
            sx={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              borderColor: 'borderSubtle',
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                top: 4,
                right: 4,
                zIndex: 1,
                display: 'flex',
                gap: 0.5,
              }}
            >
              <IconButton
                size="small"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openEditDialog(garden);
                }}
                aria-label={`${t('gardens.edit')} ${garden.name}`}
              >
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openDeleteDialog(garden);
                }}
                aria-label={`${t('gardens.delete')} ${garden.name}`}
                sx={{ color: 'error.main' }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>

            <ChevronRightIcon
              sx={{
                position: 'absolute',
                bottom: 10,
                right: 6,
                color: 'text.disabled',
                pointerEvents: 'none',
              }}
            />

            <CardActionArea
              component={RouterLink}
              to={plannerPath(garden)}
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
              }}
            >
              <CardContent sx={{ flex: 1, pr: 5 }}>
                <Typography
                  sx={{
                    fontSize: DASHBOARD_TYPE.gardenName,
                    fontWeight: 700,
                  }}
                >
                  {garden.name}
                </Typography>
                {garden.description && (
                  <Typography
                    sx={
                      expandedDescriptions.has(garden.id)
                        ? {
                            mb: 0.5,
                            fontSize: DASHBOARD_TYPE.secondary,
                            color: 'text.secondary',
                          }
                        : {
                            mb: 0.5,
                            fontSize: DASHBOARD_TYPE.secondary,
                            color: 'text.secondary',
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
                {/* Counter + preview = DISTINCT plants actually placed in the
                    map (SMA-6) - names through the shared Library resolver. */}
                <Chip
                  label={t('gardens.plantsCount', {
                    count: garden.plants.length,
                  })}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: DASHBOARD_TYPE.chipHeight,
                    fontSize: DASHBOARD_TYPE.chip,
                  }}
                />
                {garden.plants.length > 0 && (
                  <Typography
                    sx={{
                      mt: 1,
                      fontSize: DASHBOARD_TYPE.secondary,
                      color: 'text.secondary',
                    }}
                  >
                    {garden.plants
                      .slice(0, 3)
                      .map((plant) => getPlantDisplayName(plant, language))
                      .join(', ')}
                    {garden.plants.length > 3 &&
                      ` ${t('gardens.more', {
                        count: garden.plants.length - 3,
                      })}`}
                  </Typography>
                )}
              </CardContent>
            </CardActionArea>

            {/* OUTSIDE the CardActionArea (round 1, E7): the action area is an
                anchor, and a <button> nested in an <a> is invalid HTML that
                assistive technology cannot resolve into two targets. The
                preventDefault/stopPropagation pair hid the symptom in a
                browser; moving the control out removes the nesting. */}
            {garden.description && garden.description.length > 80 && (
              <Box sx={{ px: 2, pb: 1 }}>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => toggleDescription(garden.id)}
                  sx={{ p: 0, minWidth: 0, fontSize: DASHBOARD_TYPE.chip }}
                >
                  {expandedDescriptions.has(garden.id)
                    ? t('gardens.seeLess')
                    : t('gardens.seeMore')}
                </Button>
              </Box>
            )}
          </Card>
        ))}
      </Box>
    </Box>
  );

  const body = () => {
    if (loading) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} variant="rounded" height={56} />
          ))}
        </Box>
      );
    }

    if (loadError) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Typography
            sx={{ fontSize: DASHBOARD_TYPE.body, color: 'text.secondary' }}
          >
            {t('gardens.error')}
          </Typography>
          <Button size="small" onClick={onChanged}>
            {t('dashboard.retry')}
          </Button>
        </Box>
      );
    }

    if (gardens.length === 0) {
      return (
        <InviteState
          icon={<YardOutlinedIcon />}
          message={t('gardens.noGardens')}
          action={
            <Button variant="contained" size="small" onClick={onCreateClick}>
              {t('gardens.createGarden')}
            </Button>
          }
        />
      );
    }

    if (size === 'small') return smallBody();
    if (size === 'medium') return mediumBody();
    return largeBody();
  };

  return (
    <DashboardBlock
      blockKey="gardens"
      title={t('dashboard.blocks.gardens.title')}
      size={size}
      editing={editing}
      chip={!loading && !loadError && gardens.length > 0 ? countChip : undefined}
    >
      {body()}

      <Dialog
        open={editingGarden !== null}
        onClose={closeEditDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('gardens.editDialogTitle')}</DialogTitle>
        <DialogContent>
          {mutationError && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {t('gardens.mutationError')}
            </Alert>
          )}
          <TextField
            label={t('gardens.gardenName')}
            fullWidth
            required
            slotProps={{ htmlInput: { maxLength: 100 } }}
            value={editName}
            onChange={(event) => setEditName(event.target.value)}
            disabled={isMutating}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            label={t('gardens.description')}
            fullWidth
            multiline
            rows={3}
            slotProps={{ htmlInput: { maxLength: 500 } }}
            value={editDescription}
            onChange={(event) => setEditDescription(event.target.value)}
            disabled={isMutating}
          />
        </DialogContent>
        <DialogActions>
          {/* Round 3 (N'1): while `closeEditDialog` refuses to close, the
              dialog has to SAY that it is working. Cancel disabled, the fields
              disabled and a spinner on Save — the same pending shape as
              DeleteGardenDialog, so the two dialogs read alike. */}
          <Button onClick={closeEditDialog} disabled={isMutating}>
            {t('gardens.cancel')}
          </Button>
          <Button
            variant="contained"
            disabled={isMutating || !editName.trim()}
            aria-busy={isMutating}
            startIcon={
              isMutating ? (
                <CircularProgress size={18} color="inherit" aria-hidden="true" />
              ) : undefined
            }
            onClick={handleEdit}
          >
            {t('gardens.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm (SMA-18 lot 1): type-the-name brake. The list DTO only
          knows the DISTINCT placed plants, so that is the one count the body
          can honestly name here. */}
      <DeleteGardenDialog
        open={deleteOpen}
        gardenId={deleteTarget?.id ?? ''}
        gardenName={deleteTarget?.name ?? ''}
        summary={{ kind: 'list', plants: deleteTarget?.plants.length ?? 0 }}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false);
          onDeleted();
        }}
      />
    </DashboardBlock>
  );
}
