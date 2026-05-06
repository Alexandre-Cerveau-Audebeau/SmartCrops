import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SaveIcon from '@mui/icons-material/Save';
import SettingsIcon from '@mui/icons-material/Settings';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import GardenGrid from '../components/Garden/GardenGrid';
import PlantSidebar from '../components/Garden/PlantSidebar';
import SetupLayoutDialog from '../components/Garden/SetupLayoutDialog';
import { STICKY_OFFSET } from '../constants/layout';
import { useLanguage } from '../hooks/useLanguage';
import { useScrollHold } from '../hooks/useScrollHold';
import { fetchGarden } from '../services/gardenApi';
import { fetchLayout, saveLayout } from '../services/gardenLayoutApi';
import type { SavePlacementData } from '../services/gardenLayoutApi';
import type { Garden } from '../types/Garden';
import type { Plant } from '../types/Plant';
import type { CellData } from '../types/GardenLayout';
import { parseCellsJson, serializeCellsJson } from '../types/GardenLayout';
import { getTranslation } from '../utils/getTranslation';
import { getPlantColor } from '../utils/plantColor';

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
  bgcolor: 'rgba(46,125,50,0.04)',
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
  bgcolor: 'rgba(211,47,47,0.04)',
  '&:hover': { bgcolor: 'error.light', color: '#fff' },
};

export default function GardenPlanner() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const mountedRef = useRef(true);

  const [garden, setGarden] = useState<Garden | null>(null);
  const [placements, setPlacements] = useState<SavePlacementData[]>([]);
  const [grid, setGrid] = useState<CellData[][] | null>(null);
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [layoutHeight, setLayoutHeight] = useState(0);
  const [cellSize, setCellSize] = useState('50cm');
  const [shapeEditMode, setShapeEditMode] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [showResize, setShowResize] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [allPlants, setAllPlants] = useState<Plant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const [selectedPlacementIndex, setSelectedPlacementIndex] = useState<number | null>(null);

  // Drag-to-paint state
  const [isPainting, setIsPainting] = useState(false);
  const paintActionRef = useRef<boolean | null>(null);

  // Snapshot of the last saved layout (used by Cancel)
  const lastSavedRef = useRef<{
    grid: CellData[][] | null;
    layoutWidth: number;
    layoutHeight: number;
    cellSize: string;
    placements: SavePlacementData[];
  } | null>(null);

  // Visual zoom (purely view-state — does not affect saved data)
  const [zoom, setZoom] = useState(1);
  const handleZoomIn = useCallback(() => setZoom(z => Math.min(2, z + 0.2)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(0.5, z - 0.2)), []);
  const cellSizePx = Math.round(44 * zoom);

  // Horizontal scroll state for grid container
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridWrapperRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [panelTop, setPanelTop] = useState(100);
  const leftHold = useScrollHold(scrollRef, 'left');
  const rightHold = useScrollHold(scrollRef, 'right');

  useEffect(() => {
    mountedRef.current = true;
    if (!id) return;
    fetch('/api/plants', { credentials: 'include' })
      .then(res => res.json())
      .then((plants: Plant[]) => { if (mountedRef.current) setAllPlants(plants); })
      .catch(() => { /* plant fetch failure is non-blocking */ });
    Promise.all([fetchLayout(id), fetchGarden(id)])
      .then(([layoutData, gardenData]) => {
        if (!mountedRef.current) return;
        setGarden(gardenData);
        if (layoutData.width && layoutData.height && layoutData.cellSize) {
          const loadedGrid = parseCellsJson(layoutData.cellsJson, layoutData.width, layoutData.height);
          const loadedPlacements: SavePlacementData[] = (layoutData.placements ?? []).map(p => ({
            plantId: p.plantId,
            startRow: p.startRow,
            startCol: p.startCol,
            spanRows: p.spanRows,
            spanCols: p.spanCols,
            notes: p.notes,
          }));
          setLayoutWidth(layoutData.width);
          setLayoutHeight(layoutData.height);
          setCellSize(layoutData.cellSize);
          setGrid(loadedGrid);
          setPlacements(loadedPlacements);
          lastSavedRef.current = {
            grid: loadedGrid ? loadedGrid.map(row => row.map(cell => ({ ...cell }))) : null,
            layoutWidth: layoutData.width,
            layoutHeight: layoutData.height,
            cellSize: layoutData.cellSize,
            placements: loadedPlacements.map(p => ({ ...p })),
          };
        } else {
          setShowSetup(true);
        }
      })
      .catch(() => {
        if (mountedRef.current) setMessage({ type: 'error', text: t('planner.toolbar.saveError') });
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    return () => { mountedRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const notifyRemovedPlacements = useCallback((removedCount: number) => {
    if (removedCount > 0) {
      setMessage({ type: 'info', text: t('planner.placementsRemoved', { count: removedCount }) });
      setSelectedPlacementIndex(null);
    }
  }, [t]);

  const handleSetupConfirm = useCallback((cols: number, rows: number, cs: string) => {
    setLayoutWidth(cols);
    setLayoutHeight(rows);
    setCellSize(cs);
    setGrid(parseCellsJson(null, cols, rows));
    setShowSetup(false);
    setIsDirty(true);
  }, []);

  const handleResize = useCallback((newWidth: number, newHeight: number, newCellSize: string) => {
    setShowResize(false);
    const newGrid: CellData[][] = [];
    for (let r = 0; r < newHeight; r++) {
      newGrid[r] = [];
      for (let c = 0; c < newWidth; c++) {
        if (grid && r < grid.length && c < grid[r].length) {
          newGrid[r][c] = grid[r][c];
        } else {
          newGrid[r][c] = { active: true };
        }
      }
    }
    setGrid(newGrid);
    setLayoutWidth(newWidth);
    setLayoutHeight(newHeight);
    setCellSize(newCellSize);
    const filtered = placements.filter(p =>
      p.startRow + p.spanRows <= newHeight &&
      p.startCol + p.spanCols <= newWidth
    );
    notifyRemovedPlacements(placements.length - filtered.length);
    setPlacements(filtered);
    setIsDirty(true);
  }, [grid, placements, notifyRemovedPlacements]);

  // Drag-to-paint handlers
  const handleCellDragStart = useCallback((row: number, col: number) => {
    if (!shapeEditMode) return;
    setIsPainting(true);
    setGrid(prev => {
      if (!prev) return prev;
      const currentActive = prev[row][col].active;
      paintActionRef.current = !currentActive;
      const copy = prev.map(r => r.map(c => ({ ...c })));
      copy[row][col] = { ...copy[row][col], active: !currentActive };
      return copy;
    });
    setIsDirty(true);
  }, [shapeEditMode]);

  const handleCellDragEnter = useCallback((row: number, col: number) => {
    if (!isPainting || paintActionRef.current === null) return;
    const action = paintActionRef.current;
    setGrid(prev => {
      if (!prev) return prev;
      const copy = prev.map(r => r.map(c => ({ ...c })));
      copy[row][col] = { ...copy[row][col], active: action };
      return copy;
    });
    setIsDirty(true);
  }, [isPainting]);

  const handleCellDragEnd = useCallback(() => {
    setIsPainting(false);
    paintActionRef.current = null;
  }, []);

  // Add row/column handlers
  const addRowTop = useCallback(() => {
    if (!grid) return;
    const newRow: CellData[] = Array.from({ length: layoutWidth }, () => ({ active: true }));
    setGrid([newRow, ...grid]);
    setLayoutHeight(h => h + 1);
    setPlacements(prev => prev.map(p => ({ ...p, startRow: p.startRow + 1 })));
    setIsDirty(true);
  }, [grid, layoutWidth]);

  const addRowBottom = useCallback(() => {
    if (!grid) return;
    const newRow: CellData[] = Array.from({ length: layoutWidth }, () => ({ active: true }));
    setGrid([...grid, newRow]);
    setLayoutHeight(h => h + 1);
    setIsDirty(true);
  }, [grid, layoutWidth]);

  const addColLeft = useCallback(() => {
    if (!grid) return;
    setGrid(grid.map(row => [{ active: true }, ...row]));
    setLayoutWidth(w => w + 1);
    setPlacements(prev => prev.map(p => ({ ...p, startCol: p.startCol + 1 })));
    setIsDirty(true);
  }, [grid]);

  const addColRight = useCallback(() => {
    if (!grid) return;
    setGrid(grid.map(row => [...row, { active: true }]));
    setLayoutWidth(w => w + 1);
    setIsDirty(true);
  }, [grid]);

  const removeRowTop = useCallback(() => {
    if (!grid || grid.length <= 2) return;
    setGrid(grid.slice(1));
    setLayoutHeight(h => h - 1);
    const filtered = placements
      .filter(p => p.startRow >= 1)
      .map(p => ({ ...p, startRow: p.startRow - 1 }));
    notifyRemovedPlacements(placements.length - filtered.length);
    setPlacements(filtered);
    setIsDirty(true);
  }, [grid, placements, notifyRemovedPlacements]);

  const removeRowBottom = useCallback(() => {
    if (!grid || grid.length <= 2) return;
    setGrid(grid.slice(0, -1));
    const newHeight = grid.length - 1;
    setLayoutHeight(h => h - 1);
    const filtered = placements.filter(p => p.startRow + p.spanRows <= newHeight);
    notifyRemovedPlacements(placements.length - filtered.length);
    setPlacements(filtered);
    setIsDirty(true);
  }, [grid, placements, notifyRemovedPlacements]);

  const removeColLeft = useCallback(() => {
    if (!grid || !grid[0] || grid[0].length <= 2) return;
    setGrid(grid.map(row => row.slice(1)));
    setLayoutWidth(w => w - 1);
    const filtered = placements
      .filter(p => p.startCol >= 1)
      .map(p => ({ ...p, startCol: p.startCol - 1 }));
    notifyRemovedPlacements(placements.length - filtered.length);
    setPlacements(filtered);
    setIsDirty(true);
  }, [grid, placements, notifyRemovedPlacements]);

  const removeColRight = useCallback(() => {
    if (!grid || !grid[0] || grid[0].length <= 2) return;
    setGrid(grid.map(row => row.slice(0, -1)));
    const newWidth = grid[0].length - 1;
    setLayoutWidth(w => w - 1);
    const filtered = placements.filter(p => p.startCol + p.spanCols <= newWidth);
    notifyRemovedPlacements(placements.length - filtered.length);
    setPlacements(filtered);
    setIsDirty(true);
  }, [grid, placements, notifyRemovedPlacements]);

  const handleCellClick = useCallback((row: number, col: number) => {
    if (shapeEditMode || !grid || !grid[row][col].active) return;

    const existingIndex = placements.findIndex(p =>
      row >= p.startRow && row < p.startRow + p.spanRows &&
      col >= p.startCol && col < p.startCol + p.spanCols
    );

    if (selectedPlantId) {
      if (existingIndex >= 0) {
        setPlacements(prev => prev.map((p, i) =>
          i === existingIndex ? { ...p, plantId: selectedPlantId } : p
        ));
      } else {
        setPlacements(prev => [...prev, {
          plantId: selectedPlantId,
          startRow: row,
          startCol: col,
          spanRows: 1,
          spanCols: 1,
          notes: null,
        }]);
      }
      setIsDirty(true);
      return;
    }

    if (existingIndex >= 0) {
      setSelectedPlacementIndex(existingIndex);
    } else {
      setSelectedPlacementIndex(null);
    }
  }, [shapeEditMode, selectedPlantId, grid, placements]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPlantId(null);
        setSelectedPlacementIndex(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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
    if (selectedPlacementIndex === null) return;
    const node = gridWrapperRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setPanelTop(Math.max(rect.top, STICKY_OFFSET));
  }, [selectedPlacementIndex]);

  const enrichedPlacements = useMemo(() => {
    const plantMap = new Map(allPlants.map(p => [p.id, p]));
    return placements.map(p => {
      const plant = plantMap.get(p.plantId);
      return {
        ...p,
        plantName: plant
          ? (getTranslation(plant, language)?.commonName || plant.scientificName)
          : 'Unknown',
      };
    });
  }, [placements, allPlants, language]);

  const plantsToShow = useMemo(() => {
    const plantMap = new Map(allPlants.map(p => [p.id, p]));
    const seen = new Set<string>();
    const list: Array<{ plantId: string; plantName: string; scientificName: string }> = [];
    garden?.gardenPlants?.forEach(gp => {
      if (gp.plant && !seen.has(gp.plant.id)) {
        seen.add(gp.plant.id);
        list.push({
          plantId: gp.plant.id,
          plantName: getTranslation(gp.plant, language)?.commonName || gp.plant.scientificName,
          scientificName: gp.plant.scientificName,
        });
      }
    });
    placements.forEach(p => {
      if (seen.has(p.plantId)) return;
      const plant = plantMap.get(p.plantId);
      if (!plant) return;
      seen.add(p.plantId);
      list.push({
        plantId: plant.id,
        plantName: getTranslation(plant, language)?.commonName || plant.scientificName,
        scientificName: plant.scientificName,
      });
    });
    return list;
  }, [garden, placements, allPlants, language]);

  const handleSave = async () => {
    if (!id || !grid) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveLayout(id, {
        width: layoutWidth,
        height: layoutHeight,
        cellSize,
        cellsJson: serializeCellsJson(grid),
        placements,
      });
      setIsDirty(false);
      lastSavedRef.current = {
        grid: grid.map(row => row.map(cell => ({ ...cell }))),
        layoutWidth,
        layoutHeight,
        cellSize,
        placements: placements.map(p => ({ ...p })),
      };
      setMessage({ type: 'success', text: t('planner.toolbar.saveSuccess') });
    } catch {
      setMessage({ type: 'error', text: t('planner.toolbar.saveError') });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = useCallback(() => {
    if (!lastSavedRef.current) return;
    const snap = lastSavedRef.current;
    setGrid(snap.grid ? snap.grid.map(row => row.map(cell => ({ ...cell }))) : null);
    setLayoutWidth(snap.layoutWidth);
    setLayoutHeight(snap.layoutHeight);
    setCellSize(snap.cellSize);
    setPlacements(snap.placements.map(p => ({ ...p })));
    setIsDirty(false);
    setSelectedPlacementIndex(null);
    setSelectedPlantId(null);
    setMessage({ type: 'info', text: t('planner.toolbar.changesDiscarded') });
  }, [t]);

  const m = cellSizeToMeters(cellSize);
  const activeCells = grid ? grid.flat().filter(c => c.active).length : 0;
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

  const selectedPlacement = selectedPlacementIndex !== null ? placements[selectedPlacementIndex] : null;
  const selectedPlant = selectedPlacement
    ? allPlants.find(p => p.id === selectedPlacement.plantId) ?? null
    : null;
  const selectedCellSoil = selectedPlacement && grid
    ? grid[selectedPlacement.startRow]?.[selectedPlacement.startCol]?.soil
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
      <Button component={RouterLink} to="/gardens" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>
        {t('planner.toolbar.backToGardens')}
      </Button>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography variant="h5" fontWeight={700} color="primary" sx={{ mr: 'auto' }}>
          {garden?.name || t('planner.title')}
        </Typography>

        {shapeEditMode && grid && (
          <>
            <Button variant="outlined" size="small" onClick={() => {
              setGrid(grid.map(row => row.map(cell => ({ ...cell, active: true }))));
              setIsDirty(true);
            }}>
              {t('planner.shape.selectAll')}
            </Button>
            <Button variant="outlined" size="small" onClick={() => {
              setGrid(grid.map(row => row.map(cell => ({ ...cell, active: false }))));
              setIsDirty(true);
            }}>
              {t('planner.shape.deselectAll')}
            </Button>
          </>
        )}

        {grid && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton
              size="small"
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
              aria-label={t('planner.toolbar.zoomOut')}
            >
              <ZoomOutIcon fontSize="small" />
            </IconButton>
            <Typography variant="caption" sx={{ minWidth: 40, textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </Typography>
            <IconButton
              size="small"
              onClick={handleZoomIn}
              disabled={zoom >= 2}
              aria-label={t('planner.toolbar.zoomIn')}
            >
              <ZoomInIcon fontSize="small" />
            </IconButton>
          </Box>
        )}

        {grid && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<SettingsIcon />}
            onClick={() => setShowResize(true)}
          >
            {t('planner.toolbar.resize')}
          </Button>
        )}

        {isDirty && (
          <Button
            variant="outlined"
            size="small"
            color="inherit"
            onClick={handleCancel}
          >
            {t('planner.toolbar.cancel')}
          </Button>
        )}

        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
          disabled={!isDirty || saving}
          onClick={handleSave}
        >
          {saving ? t('planner.toolbar.saving') : t('planner.toolbar.save')}
        </Button>
      </Box>

      {dimensionsText && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {dimensionsText}
          {' — '}
          {t('planner.toolbar.activeCells', { active: activeCells, total: totalCells, surface: surfaceM2 })}
        </Typography>
      )}

      {isDirty && (
        <Alert
          severity="warning"
          variant="filled"
          sx={{ mb: 2 }}
          action={
            <>
              <Button color="inherit" size="small" onClick={handleCancel} sx={{ mr: 1 }}>
                {t('planner.toolbar.cancel')}
              </Button>
              <Button color="inherit" size="small" variant="outlined" onClick={handleSave} disabled={saving}>
                {saving ? t('planner.toolbar.saving') : t('planner.toolbar.save')}
              </Button>
            </>
          }
        >
          {t('planner.toolbar.unsavedChanges')}
        </Alert>
      )}

      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {grid && showHelp && (
        <Alert severity="info" variant="outlined" sx={{ mb: 2 }} icon={false} onClose={() => setShowHelp(false)}>
          <Typography variant="body2">
            {t('planner.help.unified')}
          </Typography>
        </Alert>
      )}

      {/* Two-column layout: sidebar | grid (detail panel is a floating overlay below) */}
      {grid && (
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', pb: 2, minHeight: 0 }}>
          <PlantSidebar
            plants={allPlants}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedPlantId={selectedPlantId}
            onPlantSelect={(idVal) => setSelectedPlantId(idVal || null)}
            language={language}
            shapeEditMode={shapeEditMode}
            onShapeEditToggle={setShapeEditMode}
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
            <Box sx={{ position: 'sticky', top: STICKY_OFFSET, zIndex: 5, height: 0, alignSelf: 'stretch' }}>
              {showLeftArrow && (
                <IconButton
                  size="small"
                  onMouseDown={leftHold.start}
                  onMouseUp={leftHold.stop}
                  onMouseLeave={leftHold.stop}
                  onTouchStart={leftHold.start}
                  onTouchEnd={leftHold.stop}
                  sx={{
                    position: 'absolute', left: 4, top: 4,
                    bgcolor: 'background.paper', boxShadow: 2,
                    '&:hover': { bgcolor: 'background.paper' },
                  }}
                >
                  <ChevronLeftIcon />
                </IconButton>
              )}
              {showRightArrow && (
                <IconButton
                  size="small"
                  onMouseDown={rightHold.start}
                  onMouseUp={rightHold.stop}
                  onMouseLeave={rightHold.stop}
                  onTouchStart={rightHold.start}
                  onTouchEnd={rightHold.stop}
                  sx={{
                    position: 'absolute', right: 4, top: 4,
                    bgcolor: 'background.paper', boxShadow: 2,
                    '&:hover': { bgcolor: 'background.paper' },
                  }}
                >
                  <ChevronRightIcon />
                </IconButton>
              )}
            </Box>

            {/* TOP +/- row — OUTSIDE scroll, centered in wrapper width (= visible viewport) */}
            {shapeEditMode && (
              <Box sx={{ display: 'flex', gap: 0.5, alignSelf: 'center', mb: 0.5 }}>
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
                >+</Box>
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
                >{'−'}</Box>
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
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                {shapeEditMode && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
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
                    >+</Box>
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
                    >{'−'}</Box>
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
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
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
                    >+</Box>
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
                    >{'−'}</Box>
                  </Box>
                )}
              </Box>
            </Box>

            {/* BOTTOM +/- row — OUTSIDE scroll, centered in wrapper width */}
            {shapeEditMode && (
              <Box sx={{ display: 'flex', gap: 0.5, alignSelf: 'center', mt: 0.5 }}>
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
                >+</Box>
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
                >{'−'}</Box>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Floating detail panel — anchored at the top of the map area, sticks while scrolling */}
      {selectedPlacement && (
        <Box sx={{
          position: 'fixed',
          top: panelTop,
          right: 20,
          width: 280,
          zIndex: 10,
          p: 2,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'background.paper',
          boxShadow: 3,
        }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {selectedPlant
              ? (getTranslation(selectedPlant, language)?.commonName || selectedPlant.scientificName)
              : 'Unknown'}
          </Typography>
          {selectedPlant && (
            <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary', mb: 1 }}>
              {selectedPlant.scientificName}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            {t('planner.placement.position', { row: selectedPlacement.startRow, col: selectedPlacement.startCol })}
          </Typography>
          {selectedCellSoil && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t('planner.placement.soil', { soil: selectedCellSoil })}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, fontStyle: 'italic' }}>
            {t('planner.placement.replaceHint')}
          </Typography>
          <Button
            color="error"
            size="small"
            onClick={() => {
              setPlacements(prev => prev.filter((_, i) => i !== selectedPlacementIndex));
              setSelectedPlacementIndex(null);
              setIsDirty(true);
            }}
            sx={{ mt: 1.5 }}
          >
            {t('planner.placement.remove')}
          </Button>
        </Box>
      )}

      {/* Plants in this garden (gardenPlants + placements, deduplicated) */}
      {plantsToShow.length > 0 && (
        <Box sx={{ mt: 3, mb: 2 }}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            {t('planner.plantsInGarden')} ({plantsToShow.length})
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
            {plantsToShow.map((p) => {
              const color = getPlantColor(p.plantId);
              return (
                <Box
                  key={p.plantId}
                  component={RouterLink}
                  to={`/library/${p.plantId}`}
                  state={{ from: 'planner', gardenId: id, gardenName: garden?.name }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 1,
                    minWidth: 200,
                    textDecoration: 'none',
                    color: 'text.primary',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    bgcolor: 'background.paper',
                    transition: 'border-color 0.2s, transform 0.2s, box-shadow 0.2s',
                    '&:hover': {
                      borderColor: 'primary.main',
                      transform: 'translateY(-1px)',
                      boxShadow: 1,
                    },
                  }}
                >
                  <Avatar sx={{ width: 32, height: 32, fontSize: 14, bgcolor: color }}>
                    {p.plantName.charAt(0).toUpperCase()}
                  </Avatar>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" noWrap>
                      {p.plantName}
                    </Typography>
                    <Typography variant="caption" sx={{ fontStyle: 'italic', color: 'text.secondary' }} noWrap component="div">
                      {p.scientificName}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* Status bar */}
      <Typography variant="caption" color={isDirty ? 'warning.main' : 'text.secondary'} sx={{ mt: 1 }}>
        {isDirty ? t('planner.toolbar.unsavedChanges') : t('planner.toolbar.saved')}
      </Typography>
    </Container>
  );
}
