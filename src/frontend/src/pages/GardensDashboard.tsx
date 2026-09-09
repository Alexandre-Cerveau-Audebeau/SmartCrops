import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Skeleton from '@mui/material/Skeleton';
import Snackbar from '@mui/material/Snackbar';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditIcon from '@mui/icons-material/Edit';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import CustomizePanel from '../components/Dashboard/CustomizePanel';
import DashboardGrid from '../components/Dashboard/DashboardGrid';
import GardensBlock from '../components/Dashboard/blocks/GardensBlock';
import InviteBlock from '../components/Dashboard/blocks/InviteBlock';
import { useDashboardPreferences } from '../hooks/useDashboardPreferences';
import { useGardens } from '../hooks/useGardens';
import { useLanguage } from '../hooks/useLanguage';
import { createGarden } from '../services/gardenApi';
import { DASHBOARD_SPACING, DASHBOARD_TYPE } from '../theme/dashboardTokens';
import {
  nextDashboardSize,
  type DashboardBlock,
  type DashboardBlockKey,
} from '../types/Dashboard';

/**
 * Router state the planner posts when it navigates here after deleting the
 * garden (SMA-18 lot 1). Consumed once at mount, then erased with a replace so
 * a refresh never replays the toast.
 */
type GardensNavState = { toast?: 'gardenDeleted' } | null;

/**
 * SMA-336 PR 1/5 - the gardens dashboard: eight widgets on a resizable,
 * reorderable grid, three experience levels, and preferences persisted
 * SERVER-side. It replaces `MyGardens` on `/gardens`.
 *
 * Only the Gardens widget carries data in this lot (orchestrator decision R1):
 * it is the product's one route into the planner, so it ships fed rather than
 * as an invitation. The seven others are shells that say so.
 *
 * No preference is written to `localStorage`: the layout follows the account,
 * not the browser (design freeze).
 */
export default function GardensDashboard() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const {
    level,
    blocks,
    loading,
    loadError,
    saveState,
    adjusted,
    reload,
    setBlocks,
    setLevel,
    resetToLevel,
  } = useDashboardPreferences();

  // SMA-421: the list fetch (locale re-fetch, stale-response guard,
  // post-mutation refresh) lives in useGardens.
  const {
    gardens,
    loading: gardensLoading,
    loadError: gardensError,
    refetch,
  } = useGardens(language);

  const [editing, setEditing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newGardenName, setNewGardenName] = useState('');
  const [newGardenDescription, setNewGardenDescription] = useState('');
  const [createError, setCreateError] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const navState = location.state as GardensNavState;
  // ONE toast kind today. The planner's displayedToast rationale, both halves:
  // the open flag is separate so the copy survives the Snackbar's exit
  // transition, and `toastSeq` keys the Snackbar so a second deletion inside
  // the first toast's window remounts it with a FULL auto-hide window (MUI
  // restarts the timer on `open`, not on a same-value write).
  const [toastSeq, setToastSeq] = useState(() =>
    navState?.toast === 'gardenDeleted' ? 1 : 0
  );
  const [toastOpen, setToastOpen] = useState(
    () => navState?.toast === 'gardenDeleted'
  );

  useEffect(() => {
    if (navState?.toast) {
      // Replace ONLY the state: the entry keeps its search and hash (a future
      // filter / sort / deep link must survive arriving from the planner).
      navigate(
        {
          pathname: location.pathname,
          search: location.search,
          hash: location.hash,
        },
        { replace: true, state: null }
      );
    }
  }, [navState, navigate, location.pathname, location.search, location.hash]);

  const handleCreate = async () => {
    if (isMutating) return;
    setIsMutating(true);
    setCreateError(false);
    try {
      await createGarden(newGardenName, newGardenDescription || undefined);
      setCreateDialogOpen(false);
      setNewGardenName('');
      setNewGardenDescription('');
      refetch();
    } catch {
      setCreateError(true);
    } finally {
      setIsMutating(false);
    }
  };

  const handleDeleted = () => {
    setToastSeq((sequence) => sequence + 1);
    setToastOpen(true);
    refetch();
  };

  const patchBlock = (
    key: DashboardBlockKey,
    patch: (block: DashboardBlock) => DashboardBlock
  ) => setBlocks(blocks.map((block) => (block.key === key ? patch(block) : block)));

  const renderBlock = (block: DashboardBlock) =>
    block.key === 'gardens' ? (
      <GardensBlock
        size={block.size}
        editing={editing}
        gardens={gardens}
        loading={gardensLoading}
        loadError={gardensError}
        language={language}
        onCreateClick={() => setCreateDialogOpen(true)}
        onChanged={refetch}
        onDeleted={handleDeleted}
        onExpand={() =>
          patchBlock('gardens', (current) => ({ ...current, size: 'large' }))
        }
      />
    ) : (
      <InviteBlock blockKey={block.key} size={block.size} editing={editing} />
    );

  const levelName = t(`dashboard.levels.${level}.name`);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight={700} color="primary">
            {t('gardens.title')}
          </Typography>
          {!gardensLoading && !gardensError && (
            <Typography
              sx={{
                fontSize: `${DASHBOARD_TYPE.secondary}px`,
                color: 'text.secondary',
              }}
            >
              {t('dashboard.meta', { count: gardens.length })}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {!loading && !loadError && (
            <Chip
              label={t(
                adjusted ? 'dashboard.levelChipAdjusted' : 'dashboard.levelChip',
                { level: levelName }
              )}
              size="small"
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
          )}
          {saveState !== 'idle' && (
            <Typography
              role="status"
              sx={{
                fontSize: `${DASHBOARD_TYPE.chip}px`,
                color: saveState === 'error' ? 'error.main' : 'text.secondary',
              }}
            >
              {t(`dashboard.save.${saveState}`)}
            </Typography>
          )}
          {editing ? (
            <Button variant="contained" onClick={() => setEditing(false)}>
              {t('dashboard.done')}
            </Button>
          ) : (
            <>
              <Button
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={() => setEditing(true)}
                disabled={loading || loadError}
              >
                {t('dashboard.edit')}
              </Button>
              <Button
                variant="outlined"
                startIcon={<TuneRoundedIcon />}
                onClick={() => setPanelOpen(true)}
                disabled={loading || loadError}
              >
                {t('dashboard.customize')}
              </Button>
              <Button
                variant="contained"
                startIcon={<AddRoundedIcon />}
                onClick={() => setCreateDialogOpen(true)}
              >
                {t('gardens.createGarden')}
              </Button>
            </>
          )}
        </Box>
      </Box>

      {loading && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              lg: 'repeat(4, 1fr)',
            },
            gap: `${DASHBOARD_SPACING.gutter}px`,
          }}
        >
          {[0, 1, 2, 3].map((index) => (
            <Skeleton
              key={index}
              variant="rounded"
              height={200}
              sx={{ borderRadius: '12px' }}
            />
          ))}
        </Box>
      )}

      {/* Never a blank page: a layout that cannot be read is an error the user
          can act on, not an empty grid that looks like an empty account. */}
      {loadError && (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography sx={{ mb: 2, color: 'text.secondary' }}>
            {t('dashboard.loadError')}
          </Typography>
          <Button variant="contained" onClick={reload}>
            {t('dashboard.retry')}
          </Button>
        </Box>
      )}

      {!loading && !loadError && (
        <DashboardGrid
          blocks={blocks}
          editing={editing}
          onReorder={setBlocks}
          onHide={(key) =>
            patchBlock(key, (block) => ({ ...block, hidden: true }))
          }
          onResize={(key) =>
            patchBlock(key, (block) => ({
              ...block,
              size: nextDashboardSize(block.size),
            }))
          }
          renderBlock={renderBlock}
        />
      )}

      <CustomizePanel
        open={panelOpen}
        level={level}
        blocks={blocks}
        onClose={() => setPanelOpen(false)}
        onLevelChange={setLevel}
        onReset={resetToLevel}
        onShow={(key) =>
          patchBlock(key, (block) => ({ ...block, hidden: false }))
        }
      />

      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('gardens.createDialogTitle')}</DialogTitle>
        <DialogContent>
          {createError && (
            <Typography color="error" sx={{ mb: 1 }}>
              {t('gardens.mutationError')}
            </Typography>
          )}
          <TextField
            label={t('gardens.gardenName')}
            fullWidth
            required
            inputProps={{ maxLength: 100 }}
            value={newGardenName}
            onChange={(event) => setNewGardenName(event.target.value)}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            label={t('gardens.description')}
            fullWidth
            multiline
            rows={3}
            inputProps={{ maxLength: 500 }}
            value={newGardenDescription}
            onChange={(event) => setNewGardenDescription(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>
            {t('gardens.cancel')}
          </Button>
          <Button
            variant="contained"
            disabled={isMutating || !newGardenName.trim()}
            onClick={handleCreate}
          >
            {t('gardens.create')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deletion feedback - from the Gardens widget's own dialog or from the
          planner (router state). Same Snackbar/Alert idiom as the planner. */}
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
