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
import AddIcon from '@mui/icons-material/Add';
import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import CustomizePanel from '../components/Dashboard/CustomizePanel';
import DashboardGrid from '../components/Dashboard/DashboardGrid';
import CountersBlock from '../components/Dashboard/blocks/CountersBlock';
import CountersOptionsPanel from '../components/Dashboard/blocks/CountersOptionsPanel';
import { resolveCountersFigures } from '../components/Dashboard/blocks/countersOptions';
import GardensBlock from '../components/Dashboard/blocks/GardensBlock';
import InviteBlock from '../components/Dashboard/blocks/InviteBlock';
import StatsBlock from '../components/Dashboard/blocks/StatsBlock';
import { useDashboardPreferences } from '../hooks/useDashboardPreferences';
import { useDashboardData } from '../hooks/useDashboardData';
import { useGardenViews } from '../hooks/useGardenViews';
import { useLanguage } from '../hooks/useLanguage';
import { useDashboardTokens } from '../theme/useDashboardTokens';
import { createGarden } from '../services/gardenApi';
import { DASHBOARD_SPACING, DASHBOARD_TYPE } from '../theme/dashboardTokens';
import { formatCount, formatDecimal } from '../utils/formatNumber';
import {
  nextDashboardSize,
  type DashboardBlock,
  type DashboardBlockKey,
  type GalleryPreview,
} from '../types/Dashboard';
import type { GardenView } from '../utils/gardenStats';

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
  // `language` (the provider's state) drives the FETCH; every figure the page
  // FORMATS reads `i18n.language`, like the three widgets do (round 6,
  // Extension #5-9 / #5-10). The provider updates i18next in an effect, so for
  // one render after a switch the two disagree — and a number formatted with
  // the provider's value would sit beside strings `t()` still renders in the
  // previous language. One source for what is printed together.
  const { t, i18n } = useTranslation();
  const { language } = useLanguage();
  const tk = useDashboardTokens();
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

  // The page's own share of the derivation the widgets read — see the meta line
  // below. Shared through `gardenViewOf`'s memo, so the header does not make the
  // exposure engine run a third time.
  const gardenViews = useGardenViews(gardens);
  const totalSurface = gardens.reduce(
    (sum, garden) => sum + (gardenViews.get(garden.id)?.surfaceM2 ?? 0),
    0
  );

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
            // The widget's filter chips write the SAME options document the
            // gear panel writes (round 1, E7), through the same `patchBlock`.
            onOptionsChange={(options) =>
              patchBlock('counters', (current) => ({ ...current, options }))
            }
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

  /**
   * A widget's own settings, for the Edit-mode gear. Only Counters has any —
   * the other seven open on the panel that says so.
   */
  const renderBlockOptions = (block: DashboardBlock) =>
    block.key === 'counters' ? (
      <CountersOptionsPanel
        options={block.options ?? null}
        gardens={gardens}
        onChange={(options) =>
          patchBlock('counters', (current) => ({ ...current, options }))
        }
      />
    ) : undefined;

  /**
   * A hidden widget's headline figure, for its gallery thumbnail (round 4, A8).
   *
   * Only what the page ACTUALLY holds. Three widgets are fed by the aggregate
   * and answer with their own headline — the Statistics card's surface over the
   * occupancy of the first two gardens, exactly what `A7Personnaliser.dc.html`
   * draws; the Counters card's distinct-variety count; the Gardens card's own
   * count. The other five have no data before PR 3/5 and PR 4/5 and answer
   * `null`, which the panel renders as « soon » rather than as a zero.
   *
   * Nothing is invented and nothing is derived twice: the surface and the
   * occupancies come from the same `gardenViews` the meta line and the two
   * widgets read.
   */
  const galleryPreview = (key: DashboardBlockKey): GalleryPreview | null => {
    if (gardensLoading || gardensError) return null;

    if (key === 'stats') {
      // A type GUARD rather than a plain predicate (round 6, Extension #5-16):
      // `Map.get` answers `GardenView | undefined`, and `.filter(Boolean)`-style
      // predicates do not narrow, which is what the `view!` below was covering.
      const planned = gardens
        .map((garden) => gardenViews.get(garden.id))
        .filter((view): view is GardenView => view?.hasPlan === true);
      if (planned.length === 0) return null;
      return {
        value: t('dashboard.blocks.stats.surface', {
          value: formatDecimal(totalSurface, i18n.language, 1),
        }),
        bars: planned.slice(0, 2).map((view) => view.occupancyPercent),
      };
    }
    if (key === 'counters') {
      // THROUGH THE WIDGET'S OWN FILTER (round 5, C4), and through the SAME
      // resolver the widget reads (round 6, partie A): round 5 had re-derived
      // the filtered count here, which was a fourth copy of the rule. The
      // thumbnail now prints the very `varietyCount` the widget's chip prints,
      // so the card in the gallery cannot say something the widget it stands
      // for does not say.
      const stored = blocks.find((block) => block.key === 'counters');
      const { varietyCount } = resolveCountersFigures(
        stored?.options ?? null,
        gardens,
        dashboardData.varieties,
        dashboardData.totals
      );

      if (varietyCount === 0) return null;
      return { value: formatCount(varietyCount, i18n.language) };
    }
    if (key === 'gardens') {
      if (gardens.length === 0) return null;
      return { value: formatCount(gardens.length, i18n.language) };
    }
    return null;
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
              {/* The WHOLE meta line (round 4, A3): « 3 jardins · 128 plantes ·
                  42,5 m² », which is what `Main.dc.html` writes under the page
                  title — `<div class="meta">3 jardins · 128 plantes · 42,5
                  m²</div>`. The page printed the first figure alone.

                  Three fragments joined by a fourth key, never one sentence:
                  i18next selects a plural form from ONE `count`, so a single
                  string carrying two cardinalities can only ever agree with the
                  first. Same rule as the Statistics widget's two-count lines
                  (round 1, E15 / E16 / G7).

                  The surface is DERIVED, like every other figure of this page
                  (decision D9): the aggregate transports plans, not areas, and
                  `useGardenViews` is the shared derivation the Gardens and
                  Statistics widgets already read — asking for it here costs
                  nothing, because `gardenViewOf` memoizes on the garden object. */}
              {t('dashboard.meta', {
                gardens: t('dashboard.metaGardens', { count: gardens.length }),
                plants: t('dashboard.metaPlants', {
                  count: dashboardData.totals.placementCount,
                }),
                surface: t('dashboard.metaSurface', {
                  value: formatDecimal(totalSurface, i18n.language, 1),
                }),
              })}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {!loading && !loadError && (
            /* A GLYPH before the label (round 5, A10-11). `Main.dc.html` puts
               one in front of each of the four header elements, and this was
               the one without: `<span class="lvl"><svg class="ic" …/>Vue
               Jardinier</span>`, whose path is `@mui/icons-material`'s `Tune`,
               matched attribute for attribute. `.lvl .ic { color: var(--prim) }`
               — the glyph is the chip's one coloured mark, like the glyph of a
               widget header. The outline stays: `.lvl` is the one chip of the
               page the artboard draws with a border rather than a fill. */
            <Chip
              icon={<TuneOutlinedIcon />}
              label={t(
                adjusted ? 'dashboard.levelChipAdjusted' : 'dashboard.levelChip',
                { level: levelName }
              )}
              variant="outlined"
              // `.lvl` verbatim (round 6, N5-5): `height: 32px; padding: 0 13px
              // 0 10px; border-radius: 16px; gap: 7px; font-size: 13px;
              // font-weight: 600`. A `size="small"` chip was 24 px high.
              sx={{
                height: 32,
                borderRadius: '16px',
                fontSize: 13,
                fontWeight: 600,
                // `.lvl { border: 1px solid var(--chip-bd); background: var(--card) }`
                borderColor: tk.chipBorder,
                backgroundColor: 'background.paper',
                '& .MuiChip-icon': { color: 'primary.main', fontSize: 18, ml: '10px', mr: 0 },
                '& .MuiChip-label': { pl: '7px', pr: '13px' },
              }}
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
              {/* `EditOutlined` and `Add` (round 6, N5-6 / N5-7): the two
                  paths `Main.dc.html` draws on « Modifier » and « Créer un
                  jardin », matched attribute for attribute like the two
                  others of this header were in round 5. */}
              <Button
                variant="outlined"
                startIcon={<EditOutlinedIcon />}
                onClick={() => setEditing(true)}
                disabled={loading || loadError}
              >
                {t('dashboard.edit')}
              </Button>
              {/* `DashboardCustomizeOutlined`, and not `TuneRounded` (round 5,
                  A10-11). The two glyphs were swapped: the artboard draws the
                  four squares of `DashboardCustomizeOutlined` on « Personnaliser
                  » and keeps the sliders of `Tune` for the level chip, and the
                  page had the sliders here and nothing on the chip. Putting the
                  chip's glyph back without moving this one would have drawn the
                  same sliders twice, side by side, on two controls that do
                  different things. Both paths were matched against
                  `@mui/icons-material` attribute for attribute. */}
              <Button
                variant="outlined"
                startIcon={<DashboardCustomizeOutlinedIcon />}
                onClick={() => setPanelOpen(true)}
                disabled={loading || loadError}
              >
                {t('dashboard.customize')}
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
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
          renderBlockOptions={renderBlockOptions}
        />
      )}

      <CustomizePanel
        open={panelOpen}
        level={level}
        blocks={blocks}
        preview={galleryPreview}
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
