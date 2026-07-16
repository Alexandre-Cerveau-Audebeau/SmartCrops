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
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
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
import { getPlannerTokens } from '../theme/plannerTokens';
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
import { ExposureLegend } from './gardenPlanner/ExposureLegend';
import { ExposureOverridePopover } from './gardenPlanner/ExposureOverridePopover';
import { GridControls } from './gardenPlanner/GridControls';
import { PlacementDetailPanel } from './gardenPlanner/PlacementDetailPanel';
import { PlantsInGardenSection } from './gardenPlanner/PlantsInGardenSection';
import {
  initialPlannerState,
  plannerReducer,
} from './gardenPlanner/plannerReducer';

function cellSizeToMeters(cellSize: string): number {
  if (cellSize === '1m') return 1;
  if (cellSize === '50cm') return 0.5;
  return 0.25;
}

// Referentially stable empty catalog for the not-ready renders — a fresh []
// per render would defeat every downstream memo/effect dep on `allPlants`.
const EMPTY_PLANTS: Plant[] = [];

// No blockers before 5.4 (infrastructures) — a stable [] keeps the exposure
// memo honest about its deps.
const EMPTY_BLOCKERS: Blocker[] = [];

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
  } = state;
  const hasLastSaved = state.lastSaved !== null;

  const {
    selectedPlantId,
    selectPlant,
    selectedPlacementId,
    selectPlacement,
    selectedPlacement,
    clearSelection,
  } = useSelection(placements);

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
  const [showHelp, setShowHelp] = useState(true);
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

  const cellSizePx = Math.round(44 * zoom);

  const theme = useTheme();
  const plannerMode = theme.palette.mode === 'dark' ? 'dark' : 'light';
  const tk = getPlannerTokens(plannerMode);
  // §8 responsive compass: 56 px container / 42 px SVG desktop, 40/30 mobile.
  const compassMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Derived exposure grid (5.3-D, the #171 derived-at-render pattern): NOT
  // stored — recomputed from the draft grid + garden config when a dep
  // changes. AGGREGATE mode only in 5.3-D: with no blockers yet (5.4), a
  // per-moment view would be uniformly lit — the moment preset only feeds
  // the legend title (honesty constraint: no fake variation).
  const exposureCells = useMemo(() => {
    if (!exposureVisible || !grid) return null;
    const overrides: Record<string, ExposureCategory> = {};
    grid.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell.exposureOverride) overrides[`${r},${c}`] = cell.exposureOverride;
      })
    );
    const result = computeExposureGrid({
      rows: layoutHeight,
      cols: layoutWidth,
      activeCells: grid.map((row) => row.map((cell) => cell.active)),
      orientation: garden?.orientation ?? null,
      hemisphere: garden?.hemisphere ?? null,
      latitudeBand: garden?.latitudeBand ?? null,
      gardenType: garden?.gardenType ?? null,
      lightSchedule: garden?.lightSchedule ?? null,
      blockers: EMPTY_BLOCKERS,
      overrides,
      season: exposureSeason,
    });
    return result.mode === 'aggregate' ? result.cells : null;
  }, [exposureVisible, grid, layoutWidth, layoutHeight, garden, exposureSeason]);

  // Horizontal scroll state for grid container
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridWrapperRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [panelTop, setPanelTop] = useState(100);
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
      if (shapeEditMode || !grid) return;

      const existing = placements.find(
        (p) =>
          row >= p.startRow &&
          row < p.startRow + p.spanRows &&
          col >= p.startCol &&
          col < p.startCol + p.spanCols
      );

      // Block clicks on inactive cells only when there's no placement to interact with
      if (!grid[row][col].active && !existing) return;

      if (selectedPlantId) {
        // Placement is INERT while the active-language catalog is unavailable
        // (pending or failed): the armed selection raw id could otherwise act
        // invisibly — the sidebar shows no rows, so the user cannot see what
        // is armed (SMA-288 R3, Extension 3223e82b). The stored selection is
        // intentionally KEPT and re-materializes visibly once the catalog
        // recovers.
        if (!catalogReady) return;
        if (existing) {
          dispatch({
            type: 'REPLACE_PLACEMENT',
            placementId: existing.id,
            plantId: selectedPlantId,
          });
        } else {
          dispatch({
            type: 'ADD_PLACEMENT',
            id: `new-${++placementSeq.current}`,
            plantId: selectedPlantId,
            row,
            col,
          });
        }
        return;
      }

      // Exposure override picker (5.3-D): layer visible, selection mode (no
      // armed plant — that branch returned above), ACTIVE cell WITHOUT a
      // placement. Cells WITH a placement keep the selection behavior below
      // (overriding under a placement is a documented v1 limitation).
      if (exposureVisible && !existing && anchorEl) {
        selectPlacement(null);
        setOverridePopover({ row, col, anchor: anchorEl });
        return;
      }

      selectPlacement(existing ? existing.id : null);
    },
    [shapeEditMode, grid, placements, selectedPlantId, catalogReady, exposureVisible, selectPlacement]
  );

  const handleRemoveSelectedPlacement = useCallback(() => {
    if (!selectedPlacementId) return;
    dispatch({ type: 'REMOVE_PLACEMENT', placementId: selectedPlacementId });
    selectPlacement(null);
  }, [selectedPlacementId, selectPlacement]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [clearSelection]);

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

  useEffect(() => {
    const updateTop = () => {
      const node = gridWrapperRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      setPanelTop(Math.max(rect.top, STICKY_OFFSET));
    };
    updateTop();
    window.addEventListener('scroll', updateTop, { passive: true });
    window.addEventListener('resize', updateTop);
    return () => {
      window.removeEventListener('scroll', updateTop);
      window.removeEventListener('resize', updateTop);
    };
  }, []);

  // Recompute panel top whenever the panel becomes visible — first appearance
  // would otherwise stick to the initial value of 100.
  useEffect(() => {
    if (selectedPlacementId === null) return;
    const node = gridWrapperRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setPanelTop(Math.max(rect.top, STICKY_OFFSET));
  }, [selectedPlacementId]);

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
    if (!hasLastSaved) {
      // No save yet — discard the setup draft and re-show the setup dialog
      dispatch({ type: 'DISCARD_DRAFT' });
      clearSelection();
      setShowSetup(true);
      setMessage({ type: 'info', text: t('planner.toolbar.changesDiscarded') });
      return;
    }
    dispatch({ type: 'RESTORE_LAST_SAVED' });
    clearSelection();
    setMessage({ type: 'info', text: t('planner.toolbar.changesDiscarded') });
  }, [saving, hasLastSaved, clearSelection, t]);

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
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
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

      <GridControls
        gardenName={garden?.name}
        hasGrid={grid !== null}
        shapeEditMode={shapeEditMode}
        zoom={zoom}
        isDirty={isDirty}
        saving={saving}
        exposureVisible={exposureVisible}
        exposureMoment={exposureMoment}
        exposureSeason={exposureSeason}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onOpenSettings={handleOpenSettings}
        onCancel={handleCancel}
        onSave={handleSave}
        onToggleExposure={handleToggleExposure}
        onSetExposureMoment={handleSetExposureMoment}
        onSetExposureSeason={handleSetExposureSeason}
      />

      {dimensionsText && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {dimensionsText}
          {' — '}
          {t('planner.toolbar.activeCells', {
            active: activeCells,
            total: totalCells,
            surface: surfaceM2,
          })}
        </Typography>
      )}

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

      {grid && showHelp && (
        <Alert
          severity="info"
          variant="outlined"
          sx={{ mb: 2 }}
          icon={false}
          onClose={() => setShowHelp(false)}
        >
          <Typography variant="body2">{t('planner.help.unified')}</Typography>
        </Alert>
      )}

      {/* Two-column layout: sidebar | grid (detail panel is a floating overlay below) */}
      {grid && (
        <Box
          sx={{
            display: 'flex',
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
            selectedPlantId={selectedPlantId}
            onPlantSelect={selectPlant}
            language={language}
            shapeEditMode={shapeEditMode}
            onShapeEditToggle={handleShapeEditToggle}
            catalogReady={catalogReady}
            catalogFailed={catalogFailed}
            onCatalogRetry={handleCatalogRetry}
          />

          <Box
            ref={gridWrapperRef}
            sx={{
              position: 'relative',
              flex: 1,
              minWidth: 0,
              overflow: 'visible',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Permanent compass (5.3-D, tokens §8): top-right corner of the
                grid area, overflowing it (right:-6, top:-10), card chrome,
                z-index 10, NO sun arc on the planner variant. The whole rose
                rotates so the garden's facing sits at the top (option b). */}
            <Box
              sx={{
                position: 'absolute',
                right: -6,
                top: -10,
                zIndex: 10,
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
              <CompassRose
                size={compassMobile ? 30 : 42}
                mode={plannerMode}
                orientation={garden?.orientation ?? 'S'}
                labels={{ n: 'N', e: 'E', s: 'S', w: t('planner.config.west') }}
                ariaLabel={t('planner.config.compassLabel', {
                  orientation:
                    (garden?.orientation ?? 'S') === 'W'
                      ? t('planner.config.west')
                      : (garden?.orientation ?? 'S'),
                })}
              />
            </Box>

            {/* Scroll arrows — sticky to top of viewport (page scroll) so they stay visible */}
            <Box
              sx={{
                position: 'sticky',
                top: STICKY_OFFSET,
                zIndex: 5,
                height: 0,
                alignSelf: 'stretch',
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
                    top: 4,
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
                    top: 4,
                    bgcolor: 'background.paper',
                    boxShadow: 2,
                    '&:hover': { bgcolor: 'background.paper' },
                  }}
                >
                  <ChevronRightIcon />
                </IconButton>
              )}
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

            {/* Scroll container — only the middle row (left col | grid | right col) */}
            <Box
              ref={scrollRef}
              sx={{
                overflowX: 'auto',
                overflowY: 'hidden',
                flex: '0 1 auto',
                minWidth: 0,
                maxWidth: '100%',
                alignSelf: 'center',
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
                  placements={enrichedPlacements}
                  exposure={exposureCells}
                  onCellClick={handleCellClick}
                  onCellDragStart={handleCellDragStart}
                  onCellDragEnter={handleCellDragEnter}
                  onCellDragEnd={handleCellDragEnd}
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

            {/* Exposure legend (5.3-D, tokens §9) — only while the layer is on */}
            {exposureVisible && (
              <ExposureLegend season={exposureSeason} moment={exposureMoment} />
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

      {/* Floating detail panel — anchored at the top of the map area, sticks while scrolling */}
      {selectedPlacement && (
        <PlacementDetailPanel
          placement={selectedPlacement}
          plant={selectedPlant}
          soil={selectedCellSoil}
          top={panelTop}
          language={language}
          catalogReady={catalogReady}
          onRemove={handleRemoveSelectedPlacement}
        />
      )}

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
    </Container>
  );
}
