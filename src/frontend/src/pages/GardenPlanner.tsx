import { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import SettingsIcon from '@mui/icons-material/Settings';
import GardenGrid from '../components/Garden/GardenGrid';
import SetupLayoutDialog from '../components/Garden/SetupLayoutDialog';
import { useLanguage } from '../hooks/useLanguage';
import { fetchGarden } from '../services/gardenApi';
import { fetchLayout, saveLayout } from '../services/gardenLayoutApi';
import type { Garden } from '../types/Garden';
import type { CellData } from '../types/GardenLayout';
import { parseCellsJson, serializeCellsJson } from '../types/GardenLayout';
import { getTranslation } from '../utils/getTranslation';

type Mode = 'shape' | 'garden' | 'soil';

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
  const { id } = useParams<{ id: string }>();
  const mountedRef = useRef(true);

  const [garden, setGarden] = useState<Garden | null>(null);
  const [grid, setGrid] = useState<CellData[][] | null>(null);
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [layoutHeight, setLayoutHeight] = useState(0);
  const [cellSize, setCellSize] = useState('50cm');
  const [mode, setMode] = useState<Mode>('shape');
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [showResize, setShowResize] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Drag-to-paint state
  const [isPainting, setIsPainting] = useState(false);
  const paintActionRef = useRef<boolean | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    if (!id) return;
    Promise.all([fetchLayout(id), fetchGarden(id)])
      .then(([layoutData, gardenData]) => {
        if (!mountedRef.current) return;
        setGarden(gardenData);
        if (layoutData.width && layoutData.height && layoutData.cellSize) {
          setLayoutWidth(layoutData.width);
          setLayoutHeight(layoutData.height);
          setCellSize(layoutData.cellSize);
          setGrid(parseCellsJson(layoutData.cellsJson, layoutData.width, layoutData.height));
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
    setIsDirty(true);
  }, [grid]);

  // Drag-to-paint handlers
  const handleCellDragStart = useCallback((row: number, col: number) => {
    if (mode !== 'shape') return;
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
  }, [mode]);

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
    setIsDirty(true);
  }, [grid]);

  const removeRowBottom = useCallback(() => {
    if (!grid || grid.length <= 2) return;
    setGrid(grid.slice(0, -1));
    setLayoutHeight(h => h - 1);
    setIsDirty(true);
  }, [grid]);

  const removeColLeft = useCallback(() => {
    if (!grid || !grid[0] || grid[0].length <= 2) return;
    setGrid(grid.map(row => row.slice(1)));
    setLayoutWidth(w => w - 1);
    setIsDirty(true);
  }, [grid]);

  const removeColRight = useCallback(() => {
    if (!grid || !grid[0] || grid[0].length <= 2) return;
    setGrid(grid.map(row => row.slice(0, -1)));
    setLayoutWidth(w => w - 1);
    setIsDirty(true);
  }, [grid]);

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
        placements: [],
      });
      setIsDirty(false);
      setMessage({ type: 'success', text: t('planner.toolbar.saveSuccess') });
    } catch {
      setMessage({ type: 'error', text: t('planner.toolbar.saveError') });
    } finally {
      setSaving(false);
    }
  };

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
        onCancel={() => window.history.back()}
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

        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={(_, v) => { if (v) setMode(v as Mode); }}
          size="small"
        >
          <ToggleButton value="shape">{t('planner.modes.shape')}</ToggleButton>
          <ToggleButton value="garden" disabled>{t('planner.modes.garden')}</ToggleButton>
          <ToggleButton value="soil" disabled>{t('planner.modes.soil')}</ToggleButton>
        </ToggleButtonGroup>

        {mode === 'shape' && grid && (
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
          <Button
            variant="outlined"
            size="small"
            startIcon={<SettingsIcon />}
            onClick={() => setShowResize(true)}
          >
            {t('planner.toolbar.resize')}
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

      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {grid && (
        <Alert severity="info" variant="outlined" sx={{ mb: 2 }} icon={false}>
          <Typography variant="body2">
            {mode === 'shape' && t('planner.help.shape')}
            {mode === 'garden' && t('planner.help.garden')}
            {mode === 'soil' && t('planner.help.soil')}
          </Typography>
        </Alert>
      )}

      {/* Grid with +/- buttons */}
      {grid && (
        <Box sx={{ overflow: 'auto', pb: 2, display: 'flex', justifyContent: 'center' }}>
          <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
            {mode === 'shape' && (
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Box onClick={addRowTop} sx={{ ...addBtnSx, width: 28, height: 20 }}>+</Box>
                <Box onClick={removeRowTop} sx={{ ...removeBtnSx, width: 28, height: 20 }}>{'\u2212'}</Box>
              </Box>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {mode === 'shape' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box onClick={addColLeft} sx={{ ...addBtnSx, width: 20, height: 28 }}>+</Box>
                  <Box onClick={removeColLeft} sx={{ ...removeBtnSx, width: 20, height: 28 }}>{'\u2212'}</Box>
                </Box>
              )}
              <GardenGrid
                grid={grid}
                mode={mode}
                onCellDragStart={handleCellDragStart}
                onCellDragEnter={handleCellDragEnter}
                onCellDragEnd={handleCellDragEnd}
              />
              {mode === 'shape' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box onClick={addColRight} sx={{ ...addBtnSx, width: 20, height: 28 }}>+</Box>
                  <Box onClick={removeColRight} sx={{ ...removeBtnSx, width: 20, height: 28 }}>{'\u2212'}</Box>
                </Box>
              )}
            </Box>
            {mode === 'shape' && (
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Box onClick={addRowBottom} sx={{ ...addBtnSx, width: 28, height: 20 }}>+</Box>
                <Box onClick={removeRowBottom} sx={{ ...removeBtnSx, width: 28, height: 20 }}>{'\u2212'}</Box>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Plants in this garden */}
      {garden && garden.gardenPlants.length > 0 && (
        <Box sx={{ mt: 3, mb: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            {t('planner.plantsInGarden')} ({garden.gardenPlants.length})
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {garden.gardenPlants.map((gp) => {
              const name = gp.plant
                ? (getTranslation(gp.plant, language)?.commonName || gp.plant.scientificName)
                : 'Unknown';
              return (
                <Chip
                  key={gp.plantId}
                  label={name}
                  variant="outlined"
                  size="small"
                  component={RouterLink}
                  to={`/library/${gp.plant?.id || gp.plantId}`}
                  clickable
                />
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
