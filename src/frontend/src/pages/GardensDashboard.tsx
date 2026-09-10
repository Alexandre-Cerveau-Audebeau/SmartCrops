import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
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
import Skeleton from '@mui/material/Skeleton';
import Snackbar from '@mui/material/Snackbar';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditIcon from '@mui/icons-material/Edit';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import CustomizePanel from '../components/Dashboard/CustomizePanel';
import DashboardGrid from '../components/Dashboard/DashboardGrid';
import CountersBlock from '../components/Dashboard/blocks/CountersBlock';
import GardensBlock from '../components/Dashboard/blocks/GardensBlock';
import InviteBlock from '../components/Dashboard/blocks/InviteBlock';
import StatsBlock from '../components/Dashboard/blocks/StatsBlock';
import { useDashboardPreferences } from '../hooks/useDashboardPreferences';
import { useDashboardData } from '../hooks/useDashboardData';
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

  // SMA-336 PR 2/5: one call instead of seven. `useDashboardData` keeps the
  // guards `useGardens` earned — locale re-fetch, stale-response generation,
  // post-mutation refresh (SMA-288 / SMA-421) — and answers with the plans the
  // three data widgets derive their figures from.
  const {
    data: dashboardData,
    loading: gardensLoading,
    loadError: gardensError,
    refetch,
  } = useDashboardData(language);
  const gardens = dashboardData.gardens;

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

  /**
   * EVERY way the create dialog closes (round 1, E15). Both close paths used to
   * flip the open flag alone, so a failed creation left its error and the typed
   * name behind, and the next opening started on the previous attempt.
   */
  const closeCreateDialog = () => {
    if (isMutating) return;
    setCreateDialogOpen(false);
    setCreateError(false);
    setNewGardenName('');
    setNewGardenDescription('');
  };

  const handleCreate = async () => {
    if (isMutating) return;
    setIsMutating(true);
    setCreateError(false);
    try {
      await createGarden(newGardenName, newGardenDescription || undefined);
      setCreateDialogOpen(false);
      setCreateError(false);
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

  /**
   * Whether a widget is ON the page. The Gardens table hides its WEATHER and
   * HARVEST columns when theirs are not (frozen design): a column for data the
   * user has taken off their dashboard is a column of nothing.
   */
  const isBlockVisible = (key: DashboardBlockKey) =>
    blocks.some((block) => block.key === key && !block.hidden);

  const renderBlock = (block: DashboardBlock) => {
    switch (block.key) {
      case 'gardens':
        return (
          <GardensBlock
            size={block.size}
            editing={editing}
            gardens={gardens}
            loading={gardensLoading}
            loadError={gardensError}
            language={language}
            showWeatherColumn={isBlockVisible('weather')}
            showHarvestColumn={isBlockVisible('harvest')}
            onCreateClick={() => setCreateDialogOpen(true)}
            onChanged={refetch}
            onDeleted={handleDeleted}
            onExpand={() =>
              patchBlock('gardens', (current) => ({ ...current, size: 'large' }))
            }
          />
        );
      case 'counters':
        return (
          <CountersBlock
            size={block.size}
            editing={editing}
            options={block.options ?? null}
            varieties={dashboardData.varieties}
            gardens={gardens}
            totals={dashboardData.totals}
            loading={gardensLoading}
            loadError={gardensError}
            onRetry={refetch}
          />
        );
      case 'stats':
        return (
          <StatsBlock
            size={block.size}
            editing={editing}
            gardens={gardens}
            loading={gardensLoading}
            loadError={gardensError}
            onRetry={refetch}
          />
        );
      default:
        return (
          <InviteBlock blockKey={block.key} size={block.size} editing={editing} />
        );
    }
  };

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
          {/* h1 with the h4 look (round 1, E16 / G5): every DashboardBlock
              title is an h2, so an <h4> page title put the widgets above the
              page in the heading hierarchy. */}
          <Typography
            variant="h4"
            component="h1"
            fontWeight={700}
            color="primary"
          >
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
        onClose={closeCreateDialog}
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
            slotProps={{ htmlInput: { maxLength: 100 } }}
            value={newGardenName}
            onChange={(event) => setNewGardenName(event.target.value)}
            disabled={isMutating}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            label={t('gardens.description')}
            fullWidth
            multiline
            rows={3}
            slotProps={{ htmlInput: { maxLength: 500 } }}
            value={newGardenDescription}
            onChange={(event) => setNewGardenDescription(event.target.value)}
            disabled={isMutating}
          />
        </DialogContent>
        <DialogActions>
          {/* Round 4 (E'''2, extended): `closeCreateDialog` has carried the
              same in-flight guard as the rename dialog since round 2, but here
              NOTHING said so — Cancel stayed live and silently did nothing,
              and there was no spinner at all. Same pending shape as the rename
              and delete dialogs, and the same always-mounted live region. */}
          <Typography
            role="status"
            aria-live="polite"
            variant="body2"
            color="text.secondary"
            sx={{ mr: 'auto', pl: 1 }}
          >
            {isMutating ? t('gardens.creatingStatus') : ''}
          </Typography>
          <Button onClick={closeCreateDialog} disabled={isMutating}>
            {t('gardens.cancel')}
          </Button>
          <Button
            variant="contained"
            disabled={isMutating || !newGardenName.trim()}
            aria-busy={isMutating}
            startIcon={
              isMutating ? (
                <CircularProgress size={18} color="inherit" aria-hidden="true" />
              ) : undefined
            }
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
