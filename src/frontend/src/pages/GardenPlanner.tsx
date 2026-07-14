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
import { alpha, type Theme } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import GardenGrid from '../components/Garden/GardenGrid';
import PlantSidebar from '../components/Garden/PlantSidebar';
import SetupLayoutDialog from '../components/Garden/SetupLayoutDialog';
import { STICKY_OFFSET } from '../constants/layout';
import { useGardenLayout } from '../hooks/useGardenLayout';
import { useLanguage } from '../hooks/useLanguage';
import { useScrollHold } from '../hooks/useScrollHold';
import { useSelection } from '../hooks/useSelection';
import { saveLayout } from '../services/gardenLayoutApi';
import { fetchPlants } from '../services/plantApi';
import type { Garden } from '../types/Garden';
import type { Plant } from '../types/Plant';
import { serializeCellsJson } from '../types/GardenLayout';
import { getTranslation } from '../utils/getTranslation';
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
  const mountedRef = useRef(true);
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
  const [showResize, setShowResize] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [allPlants, setAllPlants] = useState<Plant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Client-only ids for placements created since the last save — server ids
  // are GUIDs, so the `new-` prefix can never collide. Stripped at save.
  const placementSeq = useRef(0);

  const cellSizePx = Math.round(44 * zoom);

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
    mountedRef.current = true;
    if (!id) return;
    // Shared public-plants contract (credentials: 'omit'); the previous
    // hand-rolled call was not locale-aware, so no lang argument here.
    fetchPlants()
      .then((plants) => {
        if (mountedRef.current) setAllPlants(plants);
      })
      .catch(() => {
        /* plant fetch failure is non-blocking */
      });
    return () => {
      mountedRef.current = false;
    };
  }, [id]);

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

  const handleSetupConfirm = useCallback(
    (cols: number, rows: number, cs: string) => {
      dispatch({ type: 'SETUP_CONFIRMED', cols, rows, cellSize: cs });
      setShowSetup(false);
    },
    []
  );

  const handleResize = useCallback(
    (newWidth: number, newHeight: number, newCellSize: string) => {
      setShowResize(false);
      dispatch({
        type: 'RESIZED',
        width: newWidth,
        height: newHeight,
        cellSize: newCellSize,
      });
    },
    []
  );

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
  const handleOpenResize = useCallback(() => setShowResize(true), []);
  const handleShapeEditToggle = useCallback(
    (enabled: boolean) => dispatch({ type: 'SET_SHAPE_EDIT_MODE', enabled }),
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
    (row: number, col: number) => {
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

      selectPlacement(existing ? existing.id : null);
    },
    [shapeEditMode, grid, placements, selectedPlantId, selectPlacement]
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
    // While the catalog is still loading, placements have no resolvable name
    // yet — leave plantName undefined so cells render their neutral state
    // instead of flashing the 'U' of the 'Unknown' fallback (a placement can
    // hydrate before the catalog lands). 'Unknown' is reserved for plants
    // genuinely absent from the loaded catalog.
    const catalogPending = allPlants.length === 0;
    return placements.map((p) => {
      const plant = plantMap.get(p.plantId);
      return {
        ...p,
        plantName: plant
          ? getTranslation(plant, language)?.commonName || plant.scientificName
          : catalogPending
            ? undefined
            : 'Unknown',
      };
    });
  }, [placements, allPlants, language]);

  const plantsToShow = useMemo(() => {
    const plantMap = new Map(allPlants.map((p) => [p.id, p]));
    const seen = new Set<string>();
    const list: Array<{
      plantId: string;
      plantName: string;
      scientificName: string;
    }> = [];
    garden?.gardenPlants?.forEach((gp) => {
      if (gp.plant && !seen.has(gp.plant.id)) {
        seen.add(gp.plant.id);
        list.push({
          plantId: gp.plant.id,
          plantName:
            getTranslation(gp.plant, language)?.commonName ||
            gp.plant.scientificName,
          scientificName: gp.plant.scientificName,
        });
      }
    });
    placements.forEach((p) => {
      if (seen.has(p.plantId)) return;
      const plant = plantMap.get(p.plantId);
      if (!plant) return;
      seen.add(p.plantId);
      list.push({
        plantId: plant.id,
        plantName:
          getTranslation(plant, language)?.commonName || plant.scientificName,
        scientificName: plant.scientificName,
      });
    });
    return list;
  }, [garden, placements, allPlants, language]);

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
      dispatch({ type: 'MARK_SAVED' });
      setMessage({ type: 'success', text: t('planner.toolbar.saveSuccess') });
    } catch {
      setMessage({ type: 'error', text: t('planner.toolbar.saveError') });
    } finally {
      setSaving(false);
    }
  }, [t]);

  const handleCancel = useCallback(() => {
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
  }, [hasLastSaved, clearSelection, t]);

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
      {/* Setup dialog for new layouts */}
      <SetupLayoutDialog
        open={showSetup}
        onConfirm={handleSetupConfirm}
        onCancel={() => navigate('/gardens')}
      />

      {/* Resize dialog */}
      <SetupLayoutDialog
        open={showResize}
        isEdit
        initialWidth={layoutWidth}
        initialHeight={layoutHeight}
        initialCellSize={cellSize}
        onConfirm={handleResize}
        onCancel={() => setShowResize(false)}
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
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onOpenResize={handleOpenResize}
        onCancel={handleCancel}
        onSave={handleSave}
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
          </Box>
        </Box>
      )}

      {/* Floating detail panel — anchored at the top of the map area, sticks while scrolling */}
      {selectedPlacement && (
        <PlacementDetailPanel
          placement={selectedPlacement}
          plant={selectedPlant}
          soil={selectedCellSoil}
          top={panelTop}
          language={language}
          onRemove={handleRemoveSelectedPlacement}
        />
      )}

      {/* Plants in this garden (gardenPlants + placements, deduplicated) */}
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
