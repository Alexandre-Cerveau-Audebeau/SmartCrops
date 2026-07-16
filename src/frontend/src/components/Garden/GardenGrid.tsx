import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import type { CellData } from '../../types/GardenLayout';
import type { ExposureCategory } from '../../utils/exposure';
import { getPlannerTokens, type PlannerTokens } from '../../theme/plannerTokens';
import { getPlantColor } from '../../utils/plantColor';

export interface PlacementOverlay {
  plantId: string;
  startRow: number;
  startCol: number;
  spanRows: number;
  spanCols: number;
  plantName?: string;
}

interface Props {
  grid: CellData[][];
  shapeEditMode: boolean;
  placements?: PlacementOverlay[];
  /**
   * Exposure layer (SMA-17 5.3-D): the derived per-cell categories (null =
   * inactive cell). When present, each ACTIVE cell's fill/border become the
   * §3 category swatch (the layer IS the cell background — tokens doc §3);
   * placements still render on top unchanged. Absent/null = layer off.
   */
  exposure?: (ExposureCategory | null)[][] | null;
  /** The anchor element makes the cell-exposure popover attachable (5.3-D). */
  onCellClick?: (row: number, col: number, anchorEl?: HTMLElement) => void;
  onCellDragStart?: (row: number, col: number) => void;
  onCellDragEnter?: (row: number, col: number) => void;
  onCellDragEnd?: () => void;
  cellSizePx?: number;
}

// Base cells re-skinned to the design tokens (SMA-209: cellOn/cellOff exist
// in BOTH modes). The soil/infrastructure colors stay the legacy hardcoded
// values on purpose — 5.4 redoes infrastructures against tokens §6.
function getCellBg(cell: CellData, tk: PlannerTokens): string {
  if (!cell.active) return tk.cellOff;
  if (cell.infrastructure === 'wall') return '#78909c';
  if (cell.infrastructure === 'path') return '#d7ccc8';
  if (cell.infrastructure === 'water') return '#bbdefb';
  if (cell.soil === 'terreau') return '#8d6e63';
  if (cell.soil === 'sable') return '#ffe0b2';
  if (cell.soil === 'argile') return '#bcaaa4';
  return tk.cellOn;
}

// Hover cues: the tokens doc defines no hover fills, so the nearest existing
// shade is reused — the matching border token, one step off the base fill in
// BOTH modes (never an invented hex, and never the legacy light-green flash
// on the night palette).
function getCellHoverBg(cell: CellData, tk: PlannerTokens): string {
  if (!cell.active) return tk.cellOffBd;
  if (cell.infrastructure || cell.soil) return getCellBg(cell, tk);
  return tk.cellOnBd;
}

export default function GardenGrid({ grid, shapeEditMode, placements, exposure, onCellClick, onCellDragStart, onCellDragEnter, onCellDragEnd, cellSizePx = 44 }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const tk = getPlannerTokens(theme.palette.mode === 'dark' ? 'dark' : 'light');
  const height = grid.length;
  const width = height > 0 ? grid[0].length : 0;
  const hasDrag = shapeEditMode && onCellDragStart && onCellDragEnter && onCellDragEnd;

  useEffect(() => {
    if (!hasDrag || !onCellDragEnd) return;
    const handlePointerUp = () => onCellDragEnd();
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [hasDrag, onCellDragEnd]);

  const placementMap = useMemo(() => {
    const map = new Map<string, PlacementOverlay>();
    placements?.forEach(p => {
      for (let r = p.startRow; r < p.startRow + p.spanRows; r++) {
        for (let c = p.startCol; c < p.startCol + p.spanCols; c++) {
          map.set(`${r}-${c}`, p);
        }
      }
    });
    return map;
  }, [placements]);

  return (
    <Box
      role="grid"
      aria-label={t('planner.grid.label')}
      aria-rowcount={height}
      aria-colcount={width}
      onPointerUp={hasDrag ? () => onCellDragEnd!() : undefined}
      onPointerLeave={hasDrag ? () => onCellDragEnd!() : undefined}
      sx={{
        display: 'inline-grid',
        gridTemplateColumns: `repeat(${width}, ${cellSizePx}px)`,
        border: '1px solid rgba(0,0,0,0.15)',
        borderRadius: 1,
        ...(shapeEditMode && { userSelect: 'none', touchAction: 'none' }),
      }}
    >
      {grid.flatMap((row, r) =>
        row.map((cell, c) => {
          const placement = placementMap.get(`${r}-${c}`);
          const plantColor = placement ? getPlantColor(placement.plantId) : undefined;
          // Exposure tint (5.3-D): the category swatch REPLACES the cell's
          // fill/border (§3 "fill + border remplacent cell-on/cell-on-bd").
          // Placements render on top unchanged; inactive cells stay cellOff.
          const tint =
            exposure && cell.active && !placement
              ? (exposure[r]?.[c] ?? null)
              : null;
          const baseBg = tint ? tk.expo[tint].fill : getCellBg(cell, tk);
          const bg = placement ? plantColor! : baseBg;
          const hoverBg = shapeEditMode
            ? getCellHoverBg(cell, tk)
            : (placement ? plantColor! : (cell.active && !tint ? tk.cellOnBd : baseBg));
          const placementOnInactive = !cell.active && !!placement;
          const opacity = placementOnInactive ? 0.4 : (cell.active ? 1 : 0.5);
          const border = placementOnInactive
            ? '1px dashed rgba(0,0,0,0.5)'
            : placement
              ? '1px solid rgba(0,0,0,0.2)'
              : `1px solid ${
                  tint
                    ? tk.expo[tint].border
                    : cell.active
                      ? tk.cellOnBd
                      : tk.cellOffBd
                }`;
          const commonSx = {
            width: cellSizePx,
            height: cellSizePx,
            bgcolor: bg,
            // "Ombre" carries the §3 hatch as the cell's background-image.
            ...(tint === 'shade' && { backgroundImage: tk.hatch }),
            border,
            borderRadius: '4px', // §4: radius cellule 4px (border 1px)
            transition: 'background-color 0.1s',
            opacity,
            '&:hover': { bgcolor: hoverBg },
            ...(placement && {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700,
              color: 'rgba(0,0,0,0.6)',
            }),
          };

          if (shapeEditMode) {
            return (
              <Box
                key={`${r}-${c}`}
                component="button"
                type="button"
                data-exposure={tint ?? undefined}
                onPointerDown={hasDrag ? (e: React.PointerEvent) => { e.preventDefault(); onCellDragStart!(r, c); } : undefined}
                onPointerEnter={hasDrag ? () => onCellDragEnter!(r, c) : undefined}
                aria-label={`${t('planner.cell.toggleCell')} (${r}, ${c})`}
                sx={{
                  ...commonSx,
                  cursor: 'pointer',
                  p: 0,
                  outline: 'none',
                  '&:focus-visible': {
                    outline: '2px solid',
                    outlineColor: 'primary.main',
                    outlineOffset: -2,
                  },
                }}
              >
                {placement?.plantName ? placement.plantName.charAt(0).toUpperCase() : null}
              </Box>
            );
          }

          const interactive = (cell.active || !!placement) && !!onCellClick;
          return (
            <Box
              key={`${r}-${c}`}
              role="gridcell"
              data-exposure={tint ?? undefined}
              tabIndex={interactive ? 0 : -1}
              onClick={interactive ? (e: React.MouseEvent<HTMLElement>) => onCellClick!(r, c, e.currentTarget) : undefined}
              onKeyDown={interactive ? (e: React.KeyboardEvent<HTMLElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onCellClick!(r, c, e.currentTarget);
                }
              } : undefined}
              aria-label={
                cell.active
                  ? (placement?.plantName
                      ? t('planner.cell.plantedCell', { plant: placement.plantName, row: r, col: c })
                      : t('planner.cell.emptyCell', { row: r, col: c }))
                  : t('planner.cell.inactiveCell', { row: r, col: c })
              }
              sx={{
                ...commonSx,
                ...(interactive && { cursor: 'pointer' }),
                '&:focus-visible': interactive ? {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: -2,
                } : undefined,
              }}
            >
              {placement?.plantName ? placement.plantName.charAt(0).toUpperCase() : null}
            </Box>
          );
        }),
      )}
    </Box>
  );
}
