import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import SettingsIcon from '@mui/icons-material/Settings';
import { CompassRose } from '../components/Garden/CompassRose';
import GardenGrid from '../components/Garden/GardenGrid';
import PlantSidebar from '../components/Garden/PlantSidebar';
import GardenConfigDialog, {
  type DialogDimensions,
} from '../components/Garden/GardenConfigDialog';
import { STICKY_OFFSET } from '../constants/layout';
import { useGardenLayout } from '../hooks/useGardenLayout';
import { useLanguage } from '../hooks/useLanguage';
import { useScrollHold } from '../hooks/useScrollHold';
import { useSelection } from '../hooks/useSelection';
import { updateGarden } from '../services/gardenApi';
import { saveLayout } from '../services/gardenLayoutApi';
import { fetchPlants } from '../services/plantApi';
import { footprintBadgeSx, GAP_PX } from '../theme/plannerTokens';
import { usePlannerTokens } from '../theme/usePlannerTokens';
import type { Garden, GardenConfig } from '../types/Garden';
import type { Plant } from '../types/Plant';
import { serializeCellsJson } from '../types/GardenLayout';
import {
  computeExposureGrid,
  type Blocker,
  type ExposureCategory,
  type Moment,
  type Season,
} from '../utils/exposure';
import { getPlantDisplayName } from '../utils/getPlantDisplayName';
import {
  infrastructureBlockers,
  type InfrastructureType,
} from '../utils/infrastructure';
import { ExposureLegend } from './gardenPlanner/ExposureLegend';
import { ExposureOverridePopover } from './gardenPlanner/ExposureOverridePopover';
import { GridControls } from './gardenPlanner/GridControls';
import { PlacementDetailPanel } from './gardenPlanner/PlacementDetailPanel';
import { PlantsInGardenSection } from './gardenPlanner/PlantsInGardenSection';
import {
  cellRef,
  cellSizeToMeters,
  clampFootprintToGrid,
  footprintFits,
  spacingToFootprintCells,
  type FootprintFitResult,
} from './gardenPlanner/placementGeometry';
import {
  initialPlannerState,
  plannerReducer,
} from './gardenPlanner/plannerReducer';


// Referentially stable empty catalog for the not-ready renders — a fresh []
// per render would defeat every downstream memo/effect dep on `allPlants`.
const EMPTY_PLANTS: Plant[] = [];

// Stable [] for the no-grid renders — real blockers are derived from the
// painted infrastructure regions (SMA-15, 5.4); a fresh [] per render would
// defeat the exposure memo's deps.
const EMPTY_BLOCKERS: Blocker[] = [];

// Help-banner dismissal (R4): persisted under a VERSIONED key — bumping the
// version when the copy changes re-shows the banner once. SMA-302 tracks the
// rotating-tips + account-preference successor.
const HELP_BANNER_DISMISSED_KEY = 'smartcrops.planner.helpBanner.dismissed.v1';

const addBtnSx = {
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 1,
  border: '1.5px solid',
  borderColor: 'success.light',
  color: 'success.main',
  fontSize: 16,
  fontWeight: 500,
  bgcolor: (theme: Theme) => alpha(theme.palette.success.main, 0.06),
  '&:hover': { bgcolor: 'success.light', color: '#fff' },
};

const removeBtnSx = {
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 1,
  border: '1.5px solid',
  borderColor: 'error.light',
  color: 'error.main',
  fontSize: 16,
  fontWeight: 500,
  bgcolor: (theme: Theme) => alpha(theme.palette.error.main, 0.06),
  '&:hover': { bgcolor: 'error.light', color: '#fff' },
};

export default function GardenPlanner() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const {
    data: layoutSnapshot,
    loading,
    error: loadError,
  } = useGardenLayout(id);

  const [state, dispatch] = useReducer(plannerReducer, initialPlannerState);
  const {
    grid,
    layoutWidth,
    layoutHeight,
    cellSize,
    placements,
    isDirty,
    shapeEditMode,
    zoom,
    removedCount,
    removedSeq,
    exposureVisible,
    exposureMoment,
    exposureSeason,
    infraMode,
    infraType,
    placeMode,
    placePlantId,
  } = state;
  const hasLastSaved = state.lastSaved !== null;

  const { selectedPlacementId, selectPlacement, selectedPlacement, clearSelection } =
    useSelection(placements);

  const [garden, setGarden] = useState<Garden | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  // Per-cell override picker (5.3-D): anchored to the clicked cell while the
  // exposure layer is visible in selection mode.
  const [overridePopover, setOverridePopover] = useState<{
    row: number;
    col: number;
    anchor: HTMLElement;
  } | null>(null);
  // Config-save pending + error state (SMA-17 R2): the config dialog is kept
  // open until its updateGarden succeeds, Save is disabled while pending, and
  // a failure surfaces inline without discarding the entered values.
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(
    () => localStorage.getItem(HELP_BANNER_DISMISSED_KEY) === null
  );
  const handleDismissHelp = useCallback(() => {
    localStorage.setItem(HELP_BANNER_DISMISSED_KEY, '1');
    setShowHelp(false);
  }, []);
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  // The catalog CARRIES its language, and readiness is DERIVED at render
  // (5.2 R4, CR Major): `catalogReady` is true only when the loaded data's
  // locale matches the active one, so the one-render stale-name window
  // between a locale switch and the fetch effect's flush no longer exists —
  // no render can ever observe another locale's names. Explicit object (not
  // array length) so a legitimately empty catalog in the ACTIVE language
  // still reads as loaded and shows the unknown-plant fallback (R2), and a
  // failed request (catalog stays null) can never pin stale data (R3).
  const [catalog, setCatalog] = useState<{
    plants: Plant[];
    lang: string;
  } | null>(null);
  // Failure marker, language-keyed like the catalog itself (SMA-288): a
  // rejection recorded for another locale is inert by derivation, so a
  // language switch cleanly leaves the error behind and lets the new fetch
  // drive the state. Aborts never set it. `catalogAttempt` is the manual
  // retry lever — bumped from an event handler only, so the fetch effect
  // re-runs without any set-state-in-effect surface.
  const [catalogError, setCatalogError] = useState<{ lang: string } | null>(
    null
  );
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const catalogReady = catalog !== null && catalog.lang === language;
  // Keeping the derived name `allPlants` leaves every consumer untouched.
  const allPlants = catalogReady ? catalog.plants : EMPTY_PLANTS;
  // pending / ready / error are mutually exclusive per CURRENT language:
  // ready wins (a stale error can never mask fresh data), and anything
  // neither ready nor failed renders the existing neutral pending state.
  const catalogFailed =
    catalogError !== null && catalogError.lang === language && !catalogReady;
  const handleCatalogRetry = useCallback(() => {
    setCatalogError(null);
    setCatalogAttempt((n) => n + 1);
  }, []);
  const [searchQuery, setSearchQuery] = useState('');

  // Client-only ids for placements created since the last save — server ids
  // are GUIDs, so the `new-` prefix can never collide. Stripped at save.
  const placementSeq = useRef(0);

  const theme = useTheme();
  const plannerMode = theme.palette.mode === 'dark' ? 'dark' : 'light';
  const tk = usePlannerTokens();
  // The mobile breakpoint drives the §8 compass (56/40 container, 42/30 SVG)
  // AND the §4 base cell size: 58 px desktop / 30 px mobile at zoom 100% (R3).
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const cellSizePx = Math.round((isMobile ? 30 : 58) * zoom);
  // DnD (lot 2): the §4 gap at the same breakpoint — the pointer→cell math
  // inverts the exact track formula the overlays use.
  const dndGapPx = isMobile ? GAP_PX.xs : GAP_PX.sm;

  // Real blockers (SMA-15 5.4): blocking infrastructure regions derived from
  // the per-cell storage — the [] placeholder era ends here.
  const blockers = useMemo(
    () => (grid ? infrastructureBlockers(grid) : EMPTY_BLOCKERS),
    [grid]
  );
  // ONE boolean feeds both the moment computation and the legend's 5th
  // swatch, so they can never diverge: indoor gardens are schedule-driven —
  // nothing casts, and the legend must not promise a hatch that cannot render.
  const castsShadow = blockers.length > 0 && garden?.gardenType !== 'indoor';

  // Derived exposure grid (5.3-D, the #171 derived-at-render pattern): NOT
  // stored — recomputed from the draft grid + garden config when a dep
  // changes. Two engine calls since 5.4: the AGGREGATE categories (the §3
  // tints + overrides, unchanged), plus the MOMENT view whose shadowed set
  // becomes the §9 "Ombre portée" hatch overlay — that is what the moment
  // preset visibly moves now that blockers are real. Indoor gardens skip the
  // moment call: their light is schedule-driven, nothing casts.
  const exposureView = useMemo(() => {
    if (!exposureVisible || !grid) return null;
    const overrides: Record<string, ExposureCategory> = {};
    grid.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell.exposureOverride) overrides[`${r},${c}`] = cell.exposureOverride;
      })
    );
    const params = {
      rows: layoutHeight,
      cols: layoutWidth,
      activeCells: grid.map((row) => row.map((cell) => cell.active)),
      orientation: garden?.orientation ?? null,
      hemisphere: garden?.hemisphere ?? null,
      latitudeBand: garden?.latitudeBand ?? null,
      gardenType: garden?.gardenType ?? null,
      lightSchedule: garden?.lightSchedule ?? null,
      blockers,
      overrides,
      season: exposureSeason,
    };
    const aggregate = computeExposureGrid(params);
    const momentResult = castsShadow
      ? computeExposureGrid({ ...params, moment: exposureMoment })
      : null;
    return {
      cells: aggregate.mode === 'aggregate' ? aggregate.cells : null,
      cast:
        momentResult && momentResult.mode === 'moment'
          ? momentResult.cells.map((row) =>
              row.map((cellState) => cellState === 'shadowed')
            )
          : null,
    };
  }, [exposureVisible, grid, layoutWidth, layoutHeight, garden, exposureSeason, exposureMoment, blockers, castsShadow]);
  const exposureCells = exposureView?.cells ?? null;
  const castShadowCells = exposureView?.cast ?? null;

  // Horizontal scroll state for grid container
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const leftHold = useScrollHold(scrollRef, 'left');
  const rightHold = useScrollHold(scrollRef, 'right');

  const handleScrollLeftStep = useCallback(() => {
    scrollRef.current?.scrollBy({ left: -100, behavior: 'smooth' });
  }, []);
  const handleScrollRightStep = useCallback(() => {
    scrollRef.current?.scrollBy({ left: 100, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!id) return;
    // Locale-aware catalog (SMA-194): the list DTO's flat `commonName` is
    // localized server-side per `lang`, so the effect re-runs on language
    // switch — otherwise sidebar/grid/panel names would stay in the old
    // locale while gardenName etc. flip. Abort guards the stale response.
    // Eager reset (R3 shape): correctness no longer depends on it — the
    // render-time `catalogReady` derivation already gates mismatched-locale
    // data — but dropping the old catalog keeps memory honest per request.
    setCatalog(null);
    // Returning to a previously FAILED language must read as neutral PENDING
    // until the fresh request settles — never as the stale error (CR R1,
    // SMA-288 R2). Cleared alongside the catalog hygiene reset; a genuine
    // failure of THIS cycle re-records it in the rejection path below.
    setCatalogError(null);
    const controller = new AbortController();
    fetchPlants(controller.signal, language)
      .then((plants) => {
        if (!controller.signal.aborted) {
          setCatalog({ plants, lang: language });
        }
      })
      .catch(() => {
        // A real failure surfaces the sidebar error + Retry (SMA-288); an
        // abort (unmount / locale switch) must never read as a failure.
        if (!controller.signal.aborted) {
          setCatalogError({ lang: language });
        }
      });
    return () => controller.abort();
  }, [id, language, catalogAttempt]);

  // Hydrate the reducer from the hook's snapshot. useLayoutEffect so the grid
  // lands in the same paint as `loading` flipping false — the pre-hook
  // version applied both in one promise callback.
  useLayoutEffect(() => {
    if (!layoutSnapshot) return;
    const { garden: gardenData, layout: layoutData } = layoutSnapshot;
    setGarden(gardenData);
    if (layoutData.width && layoutData.height && layoutData.cellSize) {
      dispatch({
        type: 'HYDRATE_FROM_LAYOUT',
        width: layoutData.width,
        height: layoutData.height,
        cellSize: layoutData.cellSize,
        cellsJson: layoutData.cellsJson,
        placements: (layoutData.placements ?? []).map((p) => ({
          // The server placement id doubles as the stable selection identity.
          id: p.id,
          plantId: p.plantId,
          startRow: p.startRow,
          startCol: p.startCol,
          spanRows: p.spanRows,
          spanCols: p.spanCols,
          notes: p.notes,
        })),
      });
    } else {
      setShowSetup(true);
    }
  }, [layoutSnapshot]);

  // Load failure → the same toast the pre-hook catch produced (text resolved
  // at failure time, not re-resolved on language change — as before).
  useLayoutEffect(() => {
    if (loadError === null) return;
    setMessage({ type: 'error', text: t('planner.toolbar.saveError') });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadError]);

  // The old notifyRemovedPlacements side effects, driven by the reducer's
  // transient removal event: info toast + placement-selection clear.
  // useLayoutEffect so the toast shares the removal's paint, as before.
  useLayoutEffect(() => {
    if (removedSeq === 0) return;
    setMessage({
      type: 'info',
      text: t('planner.placementsRemoved', { count: removedCount }),
    });
    selectPlacement(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removedSeq]);

  // Config is GARDEN-resource state (not reducer grid geometry, #170): the
  // dialog hydrates from the GardenResponse the planner already loaded, and
  // persists back through updateGarden — separate from the layout Save flow.
  const configFromGarden: GardenConfig = {
    orientation: garden?.orientation ?? null,
    gardenType: garden?.gardenType ?? null,
    lightSchedule: garden?.lightSchedule ?? null,
    hemisphere: garden?.hemisphere ?? null,
    latitudeBand: garden?.latitudeBand ?? null,
  };

  const persistConfig = async (config: GardenConfig): Promise<boolean> => {
    if (!id || !garden) return false;
    try {
      const updated = await updateGarden(
        id,
        garden.name,
        garden.description ?? undefined,
        config
      );
      setGarden(updated);
      setConfigError(null);
      return true;
    } catch {
      // A config-specific message (NOT the layout saveError): the dialog stays
      // open with its values so the user can retry (SMA-17 R2, CR 5bd4c5e9).
      setConfigError(t('planner.config.saveError'));
      return false;
    }
  };

  // Config writes are AWAITED and serialized: a second submission is refused
  // while one is pending (Save is also disabled), so a slow PUT can never land
  // after a later one and clobber it. The dialog only closes and dimensions
  // only apply AFTER persistence succeeds.
  //
  // First setup (no layout yet): on success, SETUP_CONFIRMED establishes a
  // fresh layout (F5/F8).
  const handleSetupConfigConfirm = async (
    dims: DialogDimensions,
    config: GardenConfig
  ) => {
    if (configSaving) return;
    setConfigSaving(true);
    const ok = await persistConfig(config);
    setConfigSaving(false);
    if (!ok) return;
    dispatch({
      type: 'SETUP_CONFIRMED',
      cols: dims.cols,
      rows: dims.rows,
      cellSize: dims.cellSize,
    });
    setShowSetup(false);
  };

  // "Réglages" on an existing garden: on success, a dimension change goes
  // through RESIZED (cells preserved, out-of-bounds evicted — never a wipe);
  // dimensions still commit on the next layout Save.
  const handleSettingsConfigConfirm = async (
    dims: DialogDimensions,
    config: GardenConfig
  ) => {
    if (configSaving) return;
    setConfigSaving(true);
    const ok = await persistConfig(config);
    setConfigSaving(false);
    if (!ok) return;
    if (
      dims.cols !== layoutWidth ||
      dims.rows !== layoutHeight ||
      dims.cellSize !== cellSize
    ) {
      dispatch({
        type: 'RESIZED',
        width: dims.cols,
        height: dims.rows,
        cellSize: dims.cellSize,
      });
    }
    setShowConfig(false);
  };

  // Drag-to-paint handlers (guards live in the reducer)
  const handleCellDragStart = useCallback(
    (row: number, col: number) => dispatch({ type: 'PAINT_START', row, col }),
    []
  );
  const handleCellDragEnter = useCallback(
    (row: number, col: number) => dispatch({ type: 'PAINT_ENTER', row, col }),
    []
  );
  const handleCellDragEnd = useCallback(
    () => dispatch({ type: 'PAINT_END' }),
    []
  );

  const handleSelectAll = useCallback(
    () => dispatch({ type: 'SET_ALL_CELLS', active: true }),
    []
  );
  const handleDeselectAll = useCallback(
    () => dispatch({ type: 'SET_ALL_CELLS', active: false }),
    []
  );
  const handleZoomIn = useCallback(() => dispatch({ type: 'ZOOM_IN' }), []);
  const handleZoomOut = useCallback(() => dispatch({ type: 'ZOOM_OUT' }), []);
  const handleOpenSettings = useCallback(() => {
    setConfigError(null);
    setShowConfig(true);
  }, []);
  const handleShapeEditToggle = useCallback(
    (enabled: boolean) => dispatch({ type: 'SET_SHAPE_EDIT_MODE', enabled }),
    []
  );
  // SMA-15 (5.4) / SMA-193 (5.5) — mode plumbing. Arming an infrastructure
  // type or a plant enters its mode; the reducer's enterSelectionMode spread
  // makes the modes mutually exclusive while both armed values stay
  // remembered. The toolbar's Sélection button exits every non-default mode.
  const handleInfraSelect = useCallback(
    (type: InfrastructureType | null) =>
      dispatch({ type: 'SET_INFRA_TYPE', infraType: type }),
    []
  );
  const handlePlantSelect = useCallback((plantId: string | null) => {
    // Lot 2: the click fired right after a sidebar drag's pointerup must
    // not toggle-disarm the row it started from.
    if (dragEndedRecentlyRef.current) return;
    dispatch({ type: 'SET_PLACE_PLANT', plantId });
  }, []);
  const handleSelectionMode = useCallback(
    // R3: one action through the single reset gate (armed values remembered).
    () => dispatch({ type: 'ENTER_SELECTION_MODE' }),
    []
  );
  const handleInfraMode = useCallback(
    () => dispatch({ type: 'SET_INFRA_MODE', enabled: true }),
    []
  );
  const handlePlaceMode = useCallback(
    () => dispatch({ type: 'SET_PLACE_MODE', enabled: true }),
    []
  );

  // ── DnD drag engine (SMA-193 lot 2) ─────────────────────────────────────
  // Drag state is PAGE-LOCAL and ephemeral: React state changes only on
  // start/stop and CELL-granular target changes; the ghost follows the
  // cursor via direct style mutation — no per-frame dispatch or re-render.
  // The reducer receives only the OUTCOME (ADD/MOVE).
  type DragState = {
    kind: 'sidebar' | 'move';
    plantId: string;
    placementId: string | null;
    spanRows: number;
    spanCols: number;
    target: { startRow: number; startCol: number } | null;
    valid: boolean;
  };
  type PendingDrag = {
    kind: 'sidebar' | 'move';
    plantId: string;
    placementId: string | null;
    spanRows: number;
    spanCols: number;
    originX: number;
    originY: number;
    pointerId: number;
    sourceEl: HTMLElement;
  };
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pendingDragRef = useRef<PendingDrag | null>(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const ghostElRef = useRef<HTMLDivElement | null>(null);
  const dndGridElRef = useRef<HTMLDivElement | null>(null);
  const dragEndedRecentlyRef = useRef(false);
  const clickSwallowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const teardownDragListenersRef = useRef<(() => void) | null>(null);

  // Shared rejection toast (R2's local helper hoisted for the drag engine —
  // ADD, REPLACE and DnD drops all speak through the same copy).
  const toastFitRejection = useCallback(
    // CR R3: both dimensions — the pose-time clamp is per-axis, so the
    // rejected candidate can be RECTANGULAR (never assume R = C).
    (fit: FootprintFitResult, spanRows: number, spanCols: number) => {
      if (fit.ok) return;
      if (fit.reason === 'overlap') {
        const hit = placements.find((p) => p.id === fit.overlapWith);
        const hitPlant = hit
          ? allPlants.find((p) => p.id === hit.plantId)
          : undefined;
        setMessage({
          type: 'error',
          text: t('planner.dnd.collisionToast', {
            plant: hitPlant
              ? getPlantDisplayName(hitPlant, language)
              : t('planner.unknownPlant'),
            cell: hit ? cellRef(hit.startRow, hit.startCol) : '',
          }),
        });
      } else {
        setMessage({
          type: 'error',
          text: t('planner.dnd.footprintBlocked', { r: spanRows, c: spanCols }),
        });
      }
    },
    [placements, allPlants, language, t]
  );

  // Latest-ref (the page's handleSave pattern): the imperative document
  // listeners read through this instead of re-registering every render.
  const dndLatestRef = useRef({
    grid,
    placements,
    placeMode,
    placePlantId,
    allPlants,
    cellSize,
    cellSizePx,
    gapPx: dndGapPx,
    toastFitRejection,
  });
  dndLatestRef.current = {
    grid,
    placements,
    placeMode,
    placePlantId,
    allPlants,
    cellSize,
    cellSizePx,
    gapPx: dndGapPx,
    toastFitRejection,
  };

  /** Invert the overlay track formula: viewport coords → cell, or null off-grid. */
  const pointerToCell = (clientX: number, clientY: number) => {
    const el = dndGridElRef.current;
    const { grid: g, cellSizePx: cellPx, gapPx } = dndLatestRef.current;
    if (!el || !g) return null;
    const rect = el.getBoundingClientRect();
    const track = cellPx + gapPx;
    const col = Math.floor((clientX - rect.left) / track);
    const row = Math.floor((clientY - rect.top) / track);
    if (row < 0 || col < 0 || row >= g.length || col >= (g[0]?.length ?? 0)) {
      return null;
    }
    return { row, col };
  };

  /** Park the ghost under the cursor via direct style mutation — no re-render. */
  const positionGhost = (x: number, y: number) => {
    if (ghostElRef.current) {
      // §7 tilt + the mockup's cursor offset (~+26/+20): the ghost trails
      // the pointer without covering the target cell under it.
      ghostElRef.current.style.transform = `translate(${x + 26}px, ${y + 20}px) rotate(-2.5deg)`;
    }
  };

  /**
   * Tear the drag down (capture, document listeners, refs, React state) and,
   * on commit, revalidate the snapped target against the LATEST grid before
   * dispatching the outcome — ADD_PLACEMENT for a sidebar drag,
   * MOVE_PLACEMENT for a move. A cancel (Escape/pointercancel) commits
   * nothing.
   */
  const endDrag = useCallback((commit: boolean) => {
    const drag = dragRef.current;
    const pending = pendingDragRef.current;
    if (pending) {
      try {
        pending.sourceEl.releasePointerCapture?.(pending.pointerId);
      } catch {
        // jsdom / capture already released — teardown continues either way.
      }
    }
    teardownDragListenersRef.current?.();
    teardownDragListenersRef.current = null;
    pendingDragRef.current = null;
    dragRef.current = null;
    setDragState(null);
    if (!drag) return;
    // Swallow the click the browser fires right after pointerup — a
    // completed drag must not toggle-disarm the row or act as a cell click.
    dragEndedRecentlyRef.current = true;
    clickSwallowTimerRef.current = setTimeout(() => {
      dragEndedRecentlyRef.current = false;
    }, 0);
    if (!commit || !drag.target) return;
    const { grid: g, placements: ps, toastFitRejection: toastFit } =
      dndLatestRef.current;
    if (!g) return;
    const candidate = {
      startRow: drag.target.startRow,
      startCol: drag.target.startCol,
      spanRows: drag.spanRows,
      spanCols: drag.spanCols,
    };
    const fit = footprintFits(
      g,
      ps,
      candidate,
      drag.kind === 'move' ? (drag.placementId ?? undefined) : undefined
    );
    if (!fit.ok) {
      toastFit(fit, drag.spanRows, drag.spanCols);
      return;
    }
    if (drag.kind === 'sidebar') {
      dispatch({
        type: 'ADD_PLACEMENT',
        id: `new-${++placementSeq.current}`,
        plantId: drag.plantId,
        row: candidate.startRow,
        col: candidate.startCol,
        spanRows: drag.spanRows,
        spanCols: drag.spanCols,
      });
    } else if (drag.placementId) {
      dispatch({
        type: 'MOVE_PLACEMENT',
        placementId: drag.placementId,
        startRow: candidate.startRow,
        startCol: candidate.startCol,
      });
    }
  }, []);

  /**
   * Document-level pointermove: arms the drag once the 6px threshold is
   * crossed, then follows the cursor — the ghost moves via direct style
   * mutation on EVERY event, React state changes only when the snapped CELL
   * changes (cell-granular re-renders, the perf-round contract).
   */
  const onDragPointerMove = useCallback((e: PointerEvent) => {
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    const pending = pendingDragRef.current;
    if (pending && !dragRef.current) {
      const dist = Math.hypot(
        e.clientX - pending.originX,
        e.clientY - pending.originY
      );
      if (dist <= 6) return; // 6px threshold — below it the gesture is a click
      // Threshold crossed: the gesture becomes a drag. A sidebar drag on an
      // unarmed plant arms it now (and thereby enters Place mode).
      if (
        pending.kind === 'sidebar' &&
        dndLatestRef.current.placePlantId !== pending.plantId
      ) {
        dispatch({ type: 'SET_PLACE_PLANT', plantId: pending.plantId });
      }
      try {
        pending.sourceEl.setPointerCapture?.(pending.pointerId);
      } catch {
        // jsdom has no pointer capture — document listeners carry the drag.
      }
      const started: DragState = {
        kind: pending.kind,
        plantId: pending.plantId,
        placementId: pending.placementId,
        spanRows: pending.spanRows,
        spanCols: pending.spanCols,
        target: null,
        valid: false,
      };
      dragRef.current = started;
      setDragState(started);
    }
    const drag = dragRef.current;
    if (!drag) return;
    positionGhost(e.clientX, e.clientY);
    const cell = pointerToCell(e.clientX, e.clientY);
    const prev = drag.target;
    if (!cell && !prev) return;
    if (cell && prev && cell.row === prev.startRow && cell.col === prev.startCol) {
      return; // same cell — nothing to recompute (cell-granular state)
    }
    const { grid: g, placements: ps } = dndLatestRef.current;
    let next: DragState;
    if (!cell || !g) {
      next = { ...drag, target: null, valid: false };
    } else {
      const fit = footprintFits(
        g,
        ps,
        {
          startRow: cell.row,
          startCol: cell.col,
          spanRows: drag.spanRows,
          spanCols: drag.spanCols,
        },
        drag.kind === 'move' ? (drag.placementId ?? undefined) : undefined
      );
      next = {
        ...drag,
        target: { startRow: cell.row, startCol: cell.col },
        valid: fit.ok,
      };
    }
    dragRef.current = next;
    setDragState(next);
  }, []);

  const onDragPointerUp = useCallback(() => endDrag(true), [endDrag]);
  const onDragPointerCancel = useCallback(() => endDrag(false), [endDrag]);

  /** Register a threshold-gated pending drag and its document listeners. */
  const beginPendingDrag = useCallback(
    (pending: PendingDrag) => {
      pendingDragRef.current = pending;
      lastPointerRef.current = { x: pending.originX, y: pending.originY };
      document.addEventListener('pointermove', onDragPointerMove);
      document.addEventListener('pointerup', onDragPointerUp);
      document.addEventListener('pointercancel', onDragPointerCancel);
      teardownDragListenersRef.current = () => {
        document.removeEventListener('pointermove', onDragPointerMove);
        document.removeEventListener('pointerup', onDragPointerUp);
        document.removeEventListener('pointercancel', onDragPointerCancel);
      };
    },
    [onDragPointerMove, onDragPointerUp, onDragPointerCancel]
  );

  // Strict teardown: neither the document listeners nor the click-swallow
  // timer outlive the page (Extension R1).
  useEffect(
    () => () => {
      teardownDragListenersRef.current?.();
      if (clickSwallowTimerRef.current !== null) {
        clearTimeout(clickSwallowTimerRef.current);
      }
    },
    []
  );

  // The ghost mounts one commit AFTER the threshold crossing — position it
  // from the last known pointer as soon as it exists (and on target flips,
  // where re-applying the same coords is a no-op).
  useLayoutEffect(() => {
    if (dragState) {
      positionGhost(lastPointerRef.current.x, lastPointerRef.current.y);
    }
  }, [dragState]);

  /**
   * Sidebar drag source: a primary-pointer down on a plant row opens a
   * pending sidebar drag carrying the plant's spacing-derived footprint.
   */
  const handlePlantPointerDown = useCallback(
    (plantId: string, e: React.PointerEvent) => {
      // Secondary pointers never drag; undefined (jsdom) counts as primary.
      if (e.isPrimary === false) return;
      const { allPlants: plantsNow, cellSize: cs, grid: g } =
        dndLatestRef.current;
      const plant = plantsNow.find((p) => p.id === plantId);
      const { cells } = spacingToFootprintCells(
        plant?.xPlantSpacingValue ?? null,
        plant?.xPlantSpacingUnit ?? null,
        cs
      );
      // Lot 3: the ghost IS a pose candidate — oversized suggestions clamp
      // to the grid here too (the sidebar badge keeps the true suggestion).
      const spans = g
        ? clampFootprintToGrid(cells, g)
        : { spanRows: cells, spanCols: cells };
      beginPendingDrag({
        kind: 'sidebar',
        plantId,
        placementId: null,
        spanRows: spans.spanRows,
        spanCols: spans.spanCols,
        originX: e.clientX,
        originY: e.clientY,
        pointerId: e.pointerId,
        sourceEl: e.currentTarget as HTMLElement,
      });
    },
    [beginPendingDrag]
  );

  /**
   * Grid drag source (Place mode only): a primary-pointer down on a cell
   * covered by a placement opens a pending move-drag of THAT placement —
   * its identity and footprint come from the placement, never the armed
   * plant.
   */
  const handleCellPointerDown = useCallback(
    (row: number, col: number, e: React.PointerEvent) => {
      // Secondary pointers never drag; undefined (jsdom) counts as primary.
      if (e.isPrimary === false) return;
      // Move-drags exist in Place mode only — Selection stays inspection.
      const { placeMode: pm, placements: ps } = dndLatestRef.current;
      if (!pm) return;
      const under = ps.find(
        (p) =>
          row >= p.startRow &&
          row < p.startRow + p.spanRows &&
          col >= p.startCol &&
          col < p.startCol + p.spanCols
      );
      if (!under) return;
      beginPendingDrag({
        kind: 'move',
        plantId: under.plantId,
        placementId: under.id,
        spanRows: under.spanRows,
        spanCols: under.spanCols,
        originX: e.clientX,
        originY: e.clientY,
        pointerId: e.pointerId,
        sourceEl: e.currentTarget as HTMLElement,
      });
    },
    [beginPendingDrag]
  );
  const handleToggleExposure = useCallback(
    () => dispatch({ type: 'TOGGLE_EXPOSURE' }),
    []
  );
  const handleSetExposureMoment = useCallback(
    (moment: Moment) => dispatch({ type: 'SET_EXPOSURE_MOMENT', moment }),
    []
  );
  const handleSetExposureSeason = useCallback(
    (season: Season) => dispatch({ type: 'SET_EXPOSURE_SEASON', season }),
    []
  );
  const handleUndo = useCallback(() => dispatch({ type: 'UNDO' }), []);

  const addRowTop = useCallback(() => dispatch({ type: 'ADD_ROW_TOP' }), []);
  const addRowBottom = useCallback(
    () => dispatch({ type: 'ADD_ROW_BOTTOM' }),
    []
  );
  const addColLeft = useCallback(() => dispatch({ type: 'ADD_COL_LEFT' }), []);
  const addColRight = useCallback(
    () => dispatch({ type: 'ADD_COL_RIGHT' }),
    []
  );
  const removeRowTop = useCallback(
    () => dispatch({ type: 'REMOVE_ROW_TOP' }),
    []
  );
  const removeRowBottom = useCallback(
    () => dispatch({ type: 'REMOVE_ROW_BOTTOM' }),
    []
  );
  const removeColLeft = useCallback(
    () => dispatch({ type: 'REMOVE_COL_LEFT' }),
    []
  );
  const removeColRight = useCallback(
    () => dispatch({ type: 'REMOVE_COL_RIGHT' }),
    []
  );

  const handleCellClick = useCallback(
    (row: number, col: number, anchorEl?: HTMLElement) => {
      // Lot 2: the click the browser fires right after a drag's pointerup
      // is NOT a click intent — swallow it once.
      if (dragEndedRecentlyRef.current) return;
      // Both paint modes swallow clicks (5.4): infra cells use the drag
      // surface, like shape-edit.
      if (shapeEditMode || infraMode || !grid) return;

      const existing = placements.find(
        (p) =>
          row >= p.startRow &&
          row < p.startRow + p.spanRows &&
          col >= p.startCol &&
          col < p.startCol + p.spanCols
      );

      // Block clicks on inactive cells only when there's no placement to interact with
      if (!grid[row][col].active && !existing) return;

      if (placeMode && !placePlantId) {
        // Lot 3 R2 (product ruling 2026-07-22): armless Place mode is
        // MOVE-ONLY — a cell click never places (no dispatch, no toast).
        // Selection still works so the detail panel stays reachable, and the
        // early return keeps the 5.3-D override popover selection-only.
        selectPlacement(existing ? existing.id : null);
        return;
      }

      if (placeMode && placePlantId) {
        // Placement is INERT while the active-language catalog is unavailable
        // (pending or failed): the armed selection raw id could otherwise act
        // invisibly — the sidebar shows no rows, so the user cannot see what
        // is armed (SMA-288 R3, Extension 3223e82b). The stored selection is
        // intentionally KEPT and re-materializes visibly once the catalog
        // recovers.
        if (!catalogReady) return;
        // Footprint from the armed plant's Perenual spacing (SMA-193): the
        // same spacing→cells rule the sidebar badge shows, checked by the
        // same predicate the reducer guards with — a rejected placement can
        // therefore never half-happen; the toast is this layer's only job.
        const armedPlant = allPlants.find((p) => p.id === placePlantId);
        const { cells } = spacingToFootprintCells(
          armedPlant?.xPlantSpacingValue ?? null,
          armedPlant?.xPlantSpacingUnit ?? null,
          cellSize
        );
        // Lot 3: an oversized suggestion clamps to the grid at POSE time —
        // the tree stays placeable, the panel shrinks it afterwards.
        const spans = clampFootprintToGrid(cells, grid);
        // Lot 2: the rejection copy lives in the shared hoisted helper —
        // clicks and drag-drops speak identically.
        const toastRejection = (fit: FootprintFitResult) =>
          toastFitRejection(fit, spans.spanRows, spans.spanCols);
        if (existing) {
          // R2 (GitHub Major + Extension convergence): replacing re-derives
          // the footprint at the target's anchor and pre-checks it with the
          // target excluded — the exact ADD mirror, incl. the toast.
          const candidate = {
            startRow: existing.startRow,
            startCol: existing.startCol,
            spanRows: spans.spanRows,
            spanCols: spans.spanCols,
          };
          const fit = footprintFits(grid, placements, candidate, existing.id);
          if (!fit.ok) {
            toastRejection(fit);
            return;
          }
          dispatch({
            type: 'REPLACE_PLACEMENT',
            placementId: existing.id,
            plantId: placePlantId,
            spanRows: spans.spanRows,
            spanCols: spans.spanCols,
          });
          return;
        }
        const candidate = {
          startRow: row,
          startCol: col,
          spanRows: spans.spanRows,
          spanCols: spans.spanCols,
        };
        const fit = footprintFits(grid, placements, candidate);
        if (!fit.ok) {
          toastRejection(fit);
          return;
        }
        dispatch({
          type: 'ADD_PLACEMENT',
          id: `new-${++placementSeq.current}`,
          plantId: placePlantId,
          row,
          col,
          spanRows: spans.spanRows,
          spanCols: spans.spanCols,
        });
        return;
      }

      // Exposure override picker (5.3-D): layer visible, selection mode (not
      // placing — that branch returned above), ACTIVE cell WITHOUT a
      // placement. Cells WITH a placement keep the selection behavior below
      // (overriding under a placement is a documented v1 limitation).
      if (exposureVisible && !existing && anchorEl) {
        selectPlacement(null);
        setOverridePopover({ row, col, anchor: anchorEl });
        return;
      }

      selectPlacement(existing ? existing.id : null);
    },
    [shapeEditMode, infraMode, placeMode, placePlantId, grid, placements, allPlants, cellSize, catalogReady, exposureVisible, selectPlacement, toastFitRejection]
  );

  const handleRemoveSelectedPlacement = useCallback(() => {
    if (!selectedPlacementId) return;
    dispatch({ type: 'REMOVE_PLACEMENT', placementId: selectedPlacementId });
    selectPlacement(null);
  }, [selectedPlacementId, selectPlacement]);

  // ── Footprint panel wiring (SMA-193 lot 3) ──────────────────────────────
  // The panel's fit checks and the reducer guard share footprintFits at the
  // placement's own anchor (itself excluded) — the warn and the dispatch can
  // never disagree.
  const handleCheckSelectedFit = useCallback(
    (spanRows: number, spanCols: number): FootprintFitResult => {
      if (!selectedPlacement || !grid) {
        return { ok: false, reason: 'out-of-bounds' };
      }
      return footprintFits(
        grid,
        placements,
        {
          startRow: selectedPlacement.startRow,
          startCol: selectedPlacement.startCol,
          spanRows,
          spanCols,
        },
        selectedPlacement.id
      );
    },
    [selectedPlacement, grid, placements]
  );

  // Warn-copy fields for an overlap verdict (same naming as the toast).
  const handleDescribeOverlap = useCallback(
    (placementId: string) => {
      const hit = placements.find((p) => p.id === placementId);
      const hitPlant = hit
        ? allPlants.find((p) => p.id === hit.plantId)
        : undefined;
      return {
        plant: hitPlant
          ? getPlantDisplayName(hitPlant, language)
          : t('planner.unknownPlant'),
        cell: hit ? cellRef(hit.startRow, hit.startCol) : '',
      };
    },
    [placements, allPlants, language, t]
  );

  const handleSetSelectedFootprint = useCallback(
    (spanRows: number, spanCols: number) => {
      if (!selectedPlacementId) return;
      dispatch({
        type: 'SET_PLACEMENT_FOOTPRINT',
        placementId: selectedPlacementId,
        spanRows,
        spanCols,
      });
    },
    [selectedPlacementId]
  );

  // Move (mockup Etats): arm the placement's OWN plant — enters Place mode;
  // the lot-2 move-drag takes over from there.
  const handleMoveSelectedPlacement = useCallback(() => {
    if (!selectedPlacement) return;
    dispatch({ type: 'SET_PLACE_PLANT', plantId: selectedPlacement.plantId });
  }, [selectedPlacement]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Lot 2 precedence: Escape DURING an active drag cancels the drag
        // ONLY — mode stays, plant stays armed. The selection-exit grammar
        // below applies when no drag is active.
        if (dragRef.current) {
          endDrag(false);
          return;
        }
        // Escape clears the placement selection; in Place mode it EXITS to
        // selection while the armed plant stays REMEMBERED (R3, both review
        // surfaces converging — exact infra-grammar mirror: the toolbar
        // Placer button stays enabled to re-enter). Still gated on placeMode
        // so Escape in shape-edit/infra keeps that mode (and its in-flight
        // drag) untouched. The sidebar re-click toggle remains the explicit
        // DISARM (SET_PLACE_PLANT null) — a different intent.
        clearSelection();
        if (placeMode) {
          dispatch({ type: 'ENTER_SELECTION_MODE' });
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [clearSelection, placeMode, endDrag]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const updateArrows = () => {
      setShowLeftArrow(el.scrollLeft > 0);
      setShowRightArrow(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    updateArrows();
    el.addEventListener('scroll', updateArrows);
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      ro.disconnect();
    };
  }, [layoutWidth, layoutHeight, shapeEditMode, grid]);

  const enrichedPlacements = useMemo(() => {
    const plantMap = new Map(allPlants.map((p) => [p.id, p]));
    // While the ACTIVE-LANGUAGE catalog is not ready (request pending, failed,
    // or data from another locale), placements have no resolvable name yet —
    // leave plantName undefined so cells render their neutral state instead
    // of flashing the initial of the unknown-plant fallback (a placement can
    // hydrate before the catalog lands). The fallback is reserved for plants
    // genuinely absent from a READY catalog — including a legitimately empty
    // one (5.2 R2: explicit readiness, not length).
    const catalogPending = !catalogReady;
    return placements.map((p) => {
      const plant = plantMap.get(p.plantId);
      return {
        ...p,
        plantName: plant
          ? getPlantDisplayName(plant, language)
          : catalogPending
            ? undefined
            : t('planner.unknownPlant'),
      };
    });
  }, [placements, allPlants, catalogReady, language, t]);

  // "Plants in this garden" reads PLACEMENTS ONLY (SMA-6 Option A): the legacy
  // link-table rows (garden.gardenPlants) are deliberately not merged anymore —
  // a plant is in the garden iff it is placed on the map.
  const plantsToShow = useMemo(() => {
    const plantMap = new Map(allPlants.map((p) => [p.id, p]));
    const seen = new Set<string>();
    const list: Array<{
      plantId: string;
      plantName: string;
      scientificName: string;
    }> = [];
    placements.forEach((p) => {
      if (seen.has(p.plantId)) return;
      const plant = plantMap.get(p.plantId);
      if (!plant) return;
      seen.add(p.plantId);
      list.push({
        plantId: plant.id,
        plantName: getPlantDisplayName(plant, language),
        scientificName: plant.scientificName,
      });
    });
    return list;
  }, [placements, allPlants, language]);

  // Latest-ref pattern: handleSave reads its inputs from a ref refreshed on
  // every commit, so its identity depends only on `t` and the GridControls
  // memo stays effective across layout edits. useLayoutEffect (no deps) runs
  // synchronously after each render — the ref is always fresh before any
  // user click can invoke the callback.
  const saveInputsRef = useRef({
    id,
    grid,
    layoutWidth,
    layoutHeight,
    cellSize,
    placements,
  });
  useLayoutEffect(() => {
    saveInputsRef.current = {
      id,
      grid,
      layoutWidth,
      layoutHeight,
      cellSize,
      placements,
    };
  });

  // SMA-18: minimal display shape for the toolbar's armed-plant indicator —
  // derived from the armed id + catalog with the SAME spacing→cells rule as
  // the sidebar badge (the indicator can never disagree with it). Null while
  // nothing is armed or the plant is unresolvable (pending catalog).
  const armedPlantIndicator = useMemo(() => {
    if (!placePlantId) return null;
    const armed = allPlants.find((p) => p.id === placePlantId);
    if (!armed) return null;
    const fp = spacingToFootprintCells(
      armed.xPlantSpacingValue ?? null,
      armed.xPlantSpacingUnit ?? null,
      cellSize
    );
    return {
      name: getPlantDisplayName(armed, language),
      footprint: fp.known ? `${fp.cells}×${fp.cells}` : '1×1?',
      footprintKnown: fp.known,
    };
  }, [placePlantId, allPlants, cellSize, language]);

  const handleSave = useCallback(async () => {
    const {
      id: gardenId,
      grid: currentGrid,
      layoutWidth: width,
      layoutHeight: height,
      cellSize: currentCellSize,
      placements: currentPlacements,
    } = saveInputsRef.current;
    if (!gardenId || !currentGrid) return;
    // The exact revision being submitted, captured BEFORE the await — the
    // reducer compares references against it so edits landing while the
    // request is in flight are never falsely marked persisted.
    const submitted = {
      grid: currentGrid,
      layoutWidth: width,
      layoutHeight: height,
      cellSize: currentCellSize,
      placements: currentPlacements,
    };
    setSaving(true);
    setMessage(null);
    try {
      await saveLayout(gardenId, {
        width,
        height,
        cellSize: currentCellSize,
        cellsJson: serializeCellsJson(currentGrid),
        // Explicit field mapping: the client-only `id` must NOT reach the
        // wire — the save payload stays byte-identical to pre-5.1B.
        placements: currentPlacements.map((p) => ({
          plantId: p.plantId,
          startRow: p.startRow,
          startCol: p.startCol,
          spanRows: p.spanRows,
          spanCols: p.spanCols,
          notes: p.notes,
        })),
      });
      dispatch({ type: 'MARK_SAVED', submitted });
      setMessage({ type: 'success', text: t('planner.toolbar.saveSuccess') });
    } catch {
      setMessage({ type: 'error', text: t('planner.toolbar.saveError') });
    } finally {
      setSaving(false);
    }
  }, [t]);

  const handleCancel = useCallback(() => {
    // Never cancel while a save is in flight (develop-store review F3 on
    // ef076f0): saveLayout will still persist the submitted snapshot, so a
    // local restore/discard here would toast "changes discarded" while the
    // server keeps those changes. Both Cancel buttons are also disabled on
    // `saving`; this guard covers any race between click and state flip.
    if (saving) return;
    // Pre-5.5 equivalence: clearSelection used to disarm the armed plant too
    // — gated on placeMode so cancelling from shape-edit/infra keeps that
    // mode, exactly as before (5.5 review).
    if (!hasLastSaved) {
      // No save yet — discard the setup draft and re-show the setup dialog
      dispatch({ type: 'DISCARD_DRAFT' });
      if (placeMode) dispatch({ type: 'SET_PLACE_PLANT', plantId: null });
      clearSelection();
      setShowSetup(true);
      setMessage({ type: 'info', text: t('planner.toolbar.changesDiscarded') });
      return;
    }
    dispatch({ type: 'RESTORE_LAST_SAVED' });
    if (placeMode) dispatch({ type: 'SET_PLACE_PLANT', plantId: null });
    clearSelection();
    setMessage({ type: 'info', text: t('planner.toolbar.changesDiscarded') });
  }, [saving, hasLastSaved, placeMode, clearSelection, t]);

  const m = cellSizeToMeters(cellSize);
  const activeCells = grid ? grid.flat().filter((c) => c.active).length : 0;
  const totalCells = grid ? grid.flat().length : 0;
  const surfaceM2 = (activeCells * m * m).toFixed(1);
  const dimensionsText = grid
    ? t('planner.dimensions', {
        cols: layoutWidth,
        rows: layoutHeight,
        width: `${(layoutWidth * m).toFixed(1)}m`,
        height: `${(layoutHeight * m).toFixed(1)}m`,
        cellSize,
      })
    : '';

  // Meta line (R3 item C, restyled R4): the figures keep one line of text;
  // gardenType/orientation render as soft cnt-chip pills appended to it
  // (owner decoration beyond the mockup) — still ONLY when set; the dialog's
  // i18n labels are reused (planner.config.type.*, planner.config.west).
  const metaFigures = grid
    ? `${dimensionsText} — ${t('planner.toolbar.activeCells', {
        active: activeCells,
        total: totalCells,
        surface: surfaceM2,
      })}`
    : '';
  const metaTypeChip = garden?.gardenType
    ? t(`planner.config.type.${garden.gardenType}`)
    : null;
  const metaFacingChip = garden?.orientation
    ? t('planner.meta.facing', {
        facing:
          garden.orientation === 'W'
            ? t('planner.config.west')
            : garden.orientation,
      })
    : null;
  const hasMeta = Boolean(metaFigures || metaTypeChip || metaFacingChip);
  const metaChipSx = {
    bgcolor: tk.cntChipBg,
    color: tk.cntChipTx,
    borderRadius: '999px',
    p: '2px 10px',
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.4,
  } as const;

  const selectedPlant = selectedPlacement
    ? (allPlants.find((p) => p.id === selectedPlacement.plantId) ?? null)
    : null;
  const selectedCellSoil =
    selectedPlacement &&
    grid &&
    selectedPlacement.startRow >= 0 &&
    selectedPlacement.startRow < grid.length &&
    selectedPlacement.startCol >= 0 &&
    selectedPlacement.startCol < (grid[selectedPlacement.startRow]?.length ?? 0)
      ? grid[selectedPlacement.startRow][selectedPlacement.startCol]?.soil
      : undefined;

  if (loading) {
    return (
      <Box sx={{ px: '24px', py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  return (
    // Full-width page (R3 item F): the lg Container is replaced by a
    // full-width wrapper with 24px lateral padding — settled #177 layout
    // (24px laterals + the always-reserved 330px detail lane; v32 §0.3.26).
    <Box sx={{ px: '24px', py: 4 }}>
      {/* Config dialog — first setup (a garden with no layout yet) */}
      <GardenConfigDialog
        open={showSetup}
        isFirstSetup
        initialWidth={layoutWidth}
        initialHeight={layoutHeight}
        initialCellSize={cellSize}
        initialConfig={configFromGarden}
        busy={configSaving}
        errorText={configError}
        onConfirm={handleSetupConfigConfirm}
        onCancel={() => navigate('/gardens')}
      />

      {/* Config dialog — "Réglages" on an existing garden */}
      <GardenConfigDialog
        open={showConfig}
        isFirstSetup={false}
        initialWidth={layoutWidth}
        initialHeight={layoutHeight}
        initialCellSize={cellSize}
        initialConfig={configFromGarden}
        busy={configSaving}
        errorText={configError}
        onConfirm={handleSettingsConfigConfirm}
        onCancel={() => setShowConfig(false)}
      />

      {/* Toolbar */}
      <Button
        component={RouterLink}
        to="/gardens"
        startIcon={<ArrowBackIcon />}
        sx={{ mb: 2 }}
      >
        {t('planner.toolbar.backToGardens')}
      </Button>

      {/* Page header (R2, spec'd R3 item E): H1 32/800, meta 7px below, and
          the Réglages/Annuler/Enregistrer actions at 44px with 19px icons.
          Exporter arrives with chantier F. */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 2,
          mb: 2,
        }}
      >
        <Box sx={{ mr: 'auto' }}>
          <Typography
            component="h1"
            sx={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: '-0.01em',
              lineHeight: 1.2,
              color: tk.prim,
            }}
          >
            {garden?.name || t('planner.title')}
          </Typography>
          {hasMeta && (
            <Box
              sx={{
                mt: '7px',
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              {metaFigures && (
                // R4 (item C): the numbers-bearing text is semi-bold.
                <Typography
                  sx={{ fontSize: 14.5, fontWeight: 600, color: tk.tMeta }}
                >
                  {metaFigures}
                </Typography>
              )}
              {metaTypeChip && <Box sx={metaChipSx}>{metaTypeChip}</Box>}
              {metaFacingChip && <Box sx={metaChipSx}>{metaFacingChip}</Box>}
            </Box>
          )}
        </Box>

        {grid && (
          <Button
            variant="outlined"
            startIcon={<SettingsIcon sx={{ fontSize: 19 }} />}
            onClick={handleOpenSettings}
            sx={{
              height: 44,
              px: '17px',
              borderRadius: '8px',
              fontSize: 14.5,
              fontWeight: 700,
              bgcolor: tk.card,
              borderColor: tk.obtnBd,
              color: tk.obtnTx,
            }}
          >
            {t('planner.toolbar.settings')}
          </Button>
        )}

        {isDirty && (
          <Button
            variant="outlined"
            color="inherit"
            onClick={handleCancel}
            disabled={saving}
            sx={{
              height: 44,
              px: '17px',
              borderRadius: '8px',
              fontSize: 14.5,
              fontWeight: 700,
              borderColor: tk.obtnBd,
              color: tk.obtnTx,
            }}
          >
            {t('planner.toolbar.cancel')}
          </Button>
        )}

        <Button
          variant="contained"
          startIcon={
            saving ? (
              <CircularProgress size={18} color="inherit" />
            ) : (
              <SaveIcon sx={{ fontSize: 19 }} />
            )
          }
          disabled={!isDirty || saving}
          onClick={handleSave}
          sx={{
            height: 44,
            px: '17px',
            borderRadius: '8px',
            fontSize: 14.5,
            fontWeight: 700,
          }}
        >
          {saving ? t('planner.toolbar.saving') : t('planner.toolbar.save')}
        </Button>
      </Box>

      {isDirty && (
        <Alert
          severity="warning"
          variant="filled"
          sx={{ mb: 2 }}
          action={
            <>
              <Button
                color="inherit"
                size="small"
                onClick={handleCancel}
                disabled={saving}
                sx={{ mr: 1 }}
              >
                {t('planner.toolbar.cancel')}
              </Button>
              <Button
                color="inherit"
                size="small"
                variant="outlined"
                onClick={handleSave}
                disabled={saving}
              >
                {saving
                  ? t('planner.toolbar.saving')
                  : t('planner.toolbar.save')}
              </Button>
            </>
          }
        >
          {t('planner.toolbar.unsavedChanges')}
        </Alert>
      )}

      {message && (
        <Alert
          severity={message.type}
          sx={{ mb: 2 }}
          onClose={() => setMessage(null)}
        >
          {message.text}
        </Alert>
      )}

      {/* Help banner (R3 item D — §11 --banner-*, radius 10, padding 13×16,
          close 19px). R4: dismissal persists via the versioned localStorage
          key above (SMA-302 = rotating-tips successor). */}
      {grid && showHelp && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1.5,
            mb: 2,
            p: '13px 16px',
            borderRadius: '10px',
            bgcolor: tk.bannerBg,
            border: `1px solid ${tk.bannerBd}`,
          }}
        >
          <Typography sx={{ fontSize: 14, color: tk.bannerTx, flex: 1 }}>
            {t('planner.help.unified')}
          </Typography>
          <IconButton
            size="small"
            onClick={handleDismissHelp}
            aria-label={t('planner.config.close')}
            sx={{ p: '2px', color: tk.bannerTx }}
          >
            <CloseIcon sx={{ fontSize: 19 }} />
          </IconButton>
        </Box>
      )}

      {/* Main row: sidebar | grid | detail lane. R5 (CR accept): below lg the
          rails stack full-width around the grid — no horizontal overflow. */}
      {grid && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', lg: 'row' },
            gap: 2,
            alignItems: 'flex-start',
            pb: 2,
            minHeight: 0,
          }}
        >
          <PlantSidebar
            plants={allPlants}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedPlantId={placePlantId}
            onPlantSelect={handlePlantSelect}
            onPlantPointerDown={handlePlantPointerDown}
            cellSize={cellSize}
            selectedInfraType={infraType}
            onInfraSelect={handleInfraSelect}
            language={language}
            shapeEditMode={shapeEditMode}
            onShapeEditToggle={handleShapeEditToggle}
            catalogReady={catalogReady}
            catalogFailed={catalogFailed}
            onCatalogRetry={handleCatalogRetry}
          />

          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Toolbar card (R2, §10) — grid column only, above the grid card */}
            <GridControls
              hasGrid={grid !== null}
              shapeEditMode={shapeEditMode}
              infraMode={infraMode}
              infraArmed={infraType !== null}
              placeMode={placeMode}
              armedPlant={armedPlantIndicator}
              zoom={zoom}
              canUndo={state.past.length > 0}
              exposureVisible={exposureVisible}
              exposureMoment={exposureMoment}
              exposureSeason={exposureSeason}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onUndo={handleUndo}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onToggleExposure={handleToggleExposure}
              onSetExposureMoment={handleSetExposureMoment}
              onSetExposureSeason={handleSetExposureSeason}
              onSelectionMode={handleSelectionMode}
              onInfraMode={handleInfraMode}
              onPlaceMode={handlePlaceMode}
            />

          {/* Grid CARD (§4: radius 12, border card-bd, shadow, padding 20/12) —
              it provides the grid's frame; the compass overflows ITS corner. */}
          <Box
            sx={{
              position: 'relative',
              overflow: 'visible',
              display: 'flex',
              flexDirection: 'column',
              bgcolor: tk.card,
              border: `1px solid ${tk.cardBd}`,
              borderRadius: '12px',
              boxShadow: tk.shadow,
              p: { xs: '12px', sm: '20px' },
            }}
          >
            {/* Permanent compass (5.3-D, tokens §8): top-right corner of the
                grid card, overflowing it (right:-6, top:-10), card chrome,
                z-index 10, NO sun arc on the planner variant. The whole rose
                rotates so the garden's facing sits at the top (option b). */}
            <Box
              sx={{
                position: 'absolute',
                right: -6,
                top: -10,
                zIndex: 10,
                // R3 (CR accept): the overlay is non-interactive — clicks
                // must reach the top-right cells underneath it.
                pointerEvents: 'none',
                width: { xs: 40, sm: 56 },
                height: { xs: 40, sm: 56 },
                borderRadius: '50%',
                bgcolor: tk.card,
                border: `1px solid ${tk.cardBd}`,
                boxShadow: tk.shadow,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* R3 (CR accept): a null orientation is NOT announced as south
                  — the rose rests (N up) with an "orientation not set" label
                  until the user actually configures a facing. */}
              <CompassRose
                size={isMobile ? 30 : 42}
                mode={plannerMode}
                orientation={garden?.orientation ?? null}
                labels={{ n: 'N', e: 'E', s: 'S', w: t('planner.config.west') }}
                ariaLabel={
                  garden?.orientation
                    ? t('planner.config.compassLabel', {
                        orientation:
                          garden.orientation === 'W'
                            ? t('planner.config.west')
                            : garden.orientation,
                      })
                    : t('planner.config.compassUnset')
                }
              />
            </Box>

            {/* TOP +/- row — OUTSIDE scroll, centered in wrapper width (= visible viewport) */}
            {shapeEditMode && (
              <Box
                sx={{ display: 'flex', gap: 0.5, alignSelf: 'center', mb: 0.5 }}
              >
                <Box
                  component="button"
                  type="button"
                  onClick={addRowTop}
                  aria-label={t('planner.shape.addRowTop')}
                  sx={{
                    ...addBtnSx,
                    width: 28,
                    height: 20,
                    border: 'none',
                    cursor: 'pointer',
                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: 'primary.main',
                      outlineOffset: 2,
                    },
                  }}
                >
                  +
                </Box>
                <Box
                  component="button"
                  type="button"
                  onClick={removeRowTop}
                  aria-label={t('planner.shape.removeRowTop')}
                  sx={{
                    ...removeBtnSx,
                    width: 28,
                    height: 20,
                    border: 'none',
                    cursor: 'pointer',
                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: 'primary.main',
                      outlineOffset: 2,
                    },
                  }}
                >
                  {'−'}
                </Box>
              </Box>
            )}

            {/* Scroll viewport wrapper — the arrows anchor HERE (the wrapper,
                not the scrolling content) at the viewport's vertical center,
                so they stay visible while the user scrolls (R2). */}
            <Box
              sx={{
                position: 'relative',
                flex: '0 1 auto',
                minWidth: 0,
                maxWidth: '100%',
                alignSelf: 'center',
              }}
            >
              {showLeftArrow && (
                <IconButton
                  size="small"
                  aria-label={t('planner.toolbar.scrollLeft')}
                  onClick={() => {
                    if (!leftHold.consumeWasHeld()) handleScrollLeftStep();
                  }}
                  onPointerDown={leftHold.start}
                  onPointerUp={leftHold.stop}
                  onPointerLeave={leftHold.stop}
                  onPointerCancel={leftHold.stop}
                  sx={{
                    position: 'absolute',
                    left: 4,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 5,
                    bgcolor: 'background.paper',
                    boxShadow: 2,
                    '&:hover': { bgcolor: 'background.paper' },
                  }}
                >
                  <ChevronLeftIcon />
                </IconButton>
              )}
              {showRightArrow && (
                <IconButton
                  size="small"
                  aria-label={t('planner.toolbar.scrollRight')}
                  onClick={() => {
                    if (!rightHold.consumeWasHeld()) handleScrollRightStep();
                  }}
                  onPointerDown={rightHold.start}
                  onPointerUp={rightHold.stop}
                  onPointerLeave={rightHold.stop}
                  onPointerCancel={rightHold.stop}
                  sx={{
                    position: 'absolute',
                    right: 4,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 5,
                    bgcolor: 'background.paper',
                    boxShadow: 2,
                    '&:hover': { bgcolor: 'background.paper' },
                  }}
                >
                  <ChevronRightIcon />
                </IconButton>
              )}

            {/* Scroll container — only the middle row (left col | grid | right col) */}
            <Box
              ref={scrollRef}
              sx={{
                overflowX: 'auto',
                overflowY: 'hidden',
                minWidth: 0,
                maxWidth: '100%',
              }}
            >
              <Box
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
              >
                {shapeEditMode && (
                  <Box
                    sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}
                  >
                    <Box
                      component="button"
                      type="button"
                      onClick={addColLeft}
                      aria-label={t('planner.shape.addColLeft')}
                      sx={{
                        ...addBtnSx,
                        width: 20,
                        height: 28,
                        border: 'none',
                        cursor: 'pointer',
                        '&:focus-visible': {
                          outline: '2px solid',
                          outlineColor: 'primary.main',
                          outlineOffset: 2,
                        },
                      }}
                    >
                      +
                    </Box>
                    <Box
                      component="button"
                      type="button"
                      onClick={removeColLeft}
                      aria-label={t('planner.shape.removeColLeft')}
                      sx={{
                        ...removeBtnSx,
                        width: 20,
                        height: 28,
                        border: 'none',
                        cursor: 'pointer',
                        '&:focus-visible': {
                          outline: '2px solid',
                          outlineColor: 'primary.main',
                          outlineOffset: 2,
                        },
                      }}
                    >
                      {'−'}
                    </Box>
                  </Box>
                )}
                <GardenGrid
                  grid={grid}
                  shapeEditMode={shapeEditMode}
                  infraPaintMode={infraMode}
                  placements={enrichedPlacements}
                  exposure={exposureCells}
                  castShadow={castShadowCells}
                  onCellClick={handleCellClick}
                  onCellDragStart={handleCellDragStart}
                  onCellDragEnter={handleCellDragEnter}
                  onCellDragEnd={handleCellDragEnd}
                  // Move-drags exist in Place mode only — outside it the cells
                  // get no pointerdown wiring (and no touch-action clamp).
                  onCellPointerDown={placeMode ? handleCellPointerDown : undefined}
                  dragTarget={
                    dragState?.target
                      ? {
                          startRow: dragState.target.startRow,
                          startCol: dragState.target.startCol,
                          spanRows: dragState.spanRows,
                          spanCols: dragState.spanCols,
                          valid: dragState.valid,
                        }
                      : null
                  }
                  gridElRef={(el) => {
                    dndGridElRef.current = el;
                  }}
                  cellSizePx={cellSizePx}
                />
                {shapeEditMode && (
                  <Box
                    sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}
                  >
                    <Box
                      component="button"
                      type="button"
                      onClick={addColRight}
                      aria-label={t('planner.shape.addColRight')}
                      sx={{
                        ...addBtnSx,
                        width: 20,
                        height: 28,
                        border: 'none',
                        cursor: 'pointer',
                        '&:focus-visible': {
                          outline: '2px solid',
                          outlineColor: 'primary.main',
                          outlineOffset: 2,
                        },
                      }}
                    >
                      +
                    </Box>
                    <Box
                      component="button"
                      type="button"
                      onClick={removeColRight}
                      aria-label={t('planner.shape.removeColRight')}
                      sx={{
                        ...removeBtnSx,
                        width: 20,
                        height: 28,
                        border: 'none',
                        cursor: 'pointer',
                        '&:focus-visible': {
                          outline: '2px solid',
                          outlineColor: 'primary.main',
                          outlineOffset: 2,
                        },
                      }}
                    >
                      {'−'}
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>
            </Box>

            {/* BOTTOM +/- row — OUTSIDE scroll, centered in wrapper width */}
            {shapeEditMode && (
              <Box
                sx={{ display: 'flex', gap: 0.5, alignSelf: 'center', mt: 0.5 }}
              >
                <Box
                  component="button"
                  type="button"
                  onClick={addRowBottom}
                  aria-label={t('planner.shape.addRowBottom')}
                  sx={{
                    ...addBtnSx,
                    width: 28,
                    height: 20,
                    border: 'none',
                    cursor: 'pointer',
                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: 'primary.main',
                      outlineOffset: 2,
                    },
                  }}
                >
                  +
                </Box>
                <Box
                  component="button"
                  type="button"
                  onClick={removeRowBottom}
                  aria-label={t('planner.shape.removeRowBottom')}
                  sx={{
                    ...removeBtnSx,
                    width: 28,
                    height: 20,
                    border: 'none',
                    cursor: 'pointer',
                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: 'primary.main',
                      outlineOffset: 2,
                    },
                  }}
                >
                  {'−'}
                </Box>
              </Box>
            )}
          </Box>

            {/* Exposure legend (5.3-D, tokens §9) — only while the layer is
                on; the 5th "Ombre portée" swatch needs a blocking structure
                (SMA-15). */}
            {exposureVisible && (
              <ExposureLegend
                season={exposureSeason}
                moment={exposureMoment}
                hasCastShadow={castsShadow}
                showDndTargets={placeMode}
              />
            )}
          </Box>

          {/* Right detail LANE (R4, owner reversal of R3's on-demand lane):
              the 330px column is ALWAYS reserved — an empty spacer when
              nothing is selected. Sticky rail below the navbar
              (STICKY_OFFSET = NAVBAR_HEIGHT 64 + 16), viewport-capped and
              self-scrolling so its content stays on screen. */}
          <Box
            sx={{
              width: { xs: '100%', lg: 330 },
              flexShrink: 0,
              position: { xs: 'static', lg: 'sticky' },
              top: { lg: STICKY_OFFSET },
              alignSelf: { xs: 'stretch', lg: 'flex-start' },
              maxHeight: { lg: `calc(100vh - ${STICKY_OFFSET}px)` },
              overflowY: { lg: 'auto' },
            }}
          >
            {selectedPlacement && (
              <PlacementDetailPanel
                placement={selectedPlacement}
                plant={selectedPlant}
                soil={selectedCellSoil}
                language={language}
                catalogReady={catalogReady}
                cellSize={cellSize}
                gridRows={grid?.length ?? 0}
                gridCols={grid?.[0]?.length ?? 0}
                checkFit={handleCheckSelectedFit}
                describeOverlap={handleDescribeOverlap}
                onSetFootprint={handleSetSelectedFootprint}
                onMove={handleMoveSelectedPlacement}
                onRemove={handleRemoveSelectedPlacement}
              />
            )}
          </Box>
        </Box>
      )}

      {/* Per-cell exposure override picker (5.3-D) */}
      <ExposureOverridePopover
        open={overridePopover !== null}
        anchorEl={overridePopover?.anchor ?? null}
        current={
          overridePopover
            ? (grid?.[overridePopover.row]?.[overridePopover.col]
                ?.exposureOverride ?? null)
            : null
        }
        onSelect={(value) => {
          if (overridePopover) {
            dispatch({
              type: 'SET_CELL_EXPOSURE_OVERRIDE',
              row: overridePopover.row,
              col: overridePopover.col,
              value,
            });
          }
          setOverridePopover(null);
        }}
        onClose={() => setOverridePopover(null)}
      />

      {/* Plants in this garden — derived from placements only (SMA-6 Option A) */}
      {plantsToShow.length > 0 && (
        <PlantsInGardenSection
          plants={plantsToShow}
          gardenId={id}
          gardenName={garden?.name}
        />
      )}

      {/* Status bar */}
      <Typography
        variant="caption"
        color={isDirty ? 'warning.main' : 'text.secondary'}
        sx={{ mt: 1 }}
      >
        {isDirty
          ? t('planner.toolbar.unsavedChanges')
          : t('planner.toolbar.saved')}
      </Typography>

      {/* DnD ghost (lot 2, §7): decorative cursor-follower — position is
          mutated directly on pointermove (no re-render); parked off-screen
          until the first move lands. */}
      {dragState && (
        <Box
          ref={ghostElRef}
          aria-hidden
          data-dnd-ghost
          sx={{
            position: 'fixed',
            left: 0,
            top: 0,
            zIndex: 2000,
            pointerEvents: 'none',
            width: `${dragState.spanCols * (cellSizePx + dndGapPx) - dndGapPx}px`,
            height: `${dragState.spanRows * (cellSizePx + dndGapPx) - dndGapPx}px`,
            bgcolor: tk.ghostBg,
            color: tk.ghostTx,
            border: `2px solid ${tk.prim}`,
            borderRadius: '9px', // §7
            boxShadow: '0 14px 30px rgba(10,40,20,0.35)', // §7
            opacity: 0.93, // §7
            transform: 'translate(-1000px, -1000px) rotate(-2.5deg)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            fontWeight: 800,
            fontSize: { xs: 12, sm: 16 },
          }}
        >
          {(() => {
            const ghostPlant = allPlants.find(
              (p) => p.id === dragState.plantId
            );
            return ghostPlant
              ? getPlantDisplayName(ghostPlant, language)
                  .charAt(0)
                  .toUpperCase()
              : '';
          })()}
          {/* The N×N chip mirrors the sidebar footprint badge — the
              project's one footprint-chip styling (no placement pill
              exists; declared adaptation). */}
          <Box component="span" sx={{ ...footprintBadgeSx(tk, true), bgcolor: tk.card }}>
            {`${dragState.spanRows}×${dragState.spanCols}`}
          </Box>
        </Box>
      )}

      {/* §7 hint pill — visible for the whole drag. */}
      {dragState && (
        <Box
          data-dnd-hint
          sx={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2000,
            pointerEvents: 'none',
            bgcolor: tk.hintBg,
            color: tk.hintTx,
            borderRadius: '999px',
            px: '14px',
            py: '7px',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {t('planner.dnd.dropHint')}
        </Box>
      )}
    </Box>
  );
}
