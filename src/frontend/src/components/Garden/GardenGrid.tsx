import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import type { CellData } from '../../types/GardenLayout';
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
  onCellClick?: (row: number, col: number) => void;
  onCellDragStart?: (row: number, col: number) => void;
  onCellDragEnter?: (row: number, col: number) => void;
  onCellDragEnd?: () => void;
  cellSizePx?: number;
}

function getCellBg(cell: CellData): string {
  if (!cell.active) return '#e0e0e0';
  if (cell.infrastructure === 'wall') return '#78909c';
  if (cell.infrastructure === 'path') return '#d7ccc8';
  if (cell.infrastructure === 'water') return '#bbdefb';
  if (cell.soil === 'terreau') return '#8d6e63';
  if (cell.soil === 'sable') return '#ffe0b2';
  if (cell.soil === 'argile') return '#bcaaa4';
  return '#e8f5e9';
}

function getCellHoverBg(cell: CellData): string {
  if (!cell.active) return '#bdbdbd';
  if (cell.infrastructure || cell.soil) return getCellBg(cell);
  return '#c8e6c9';
}

export default function GardenGrid({ grid, shapeEditMode, placements, onCellClick, onCellDragStart, onCellDragEnter, onCellDragEnd, cellSizePx = 44 }: Props) {
  const { t } = useTranslation();
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

  return (
    <Box
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
          const placement = placements?.find(p =>
            r >= p.startRow && r < p.startRow + p.spanRows &&
            c >= p.startCol && c < p.startCol + p.spanCols
          );
          const plantColor = placement ? getPlantColor(placement.plantId) : undefined;
          const baseBg = getCellBg(cell);
          const bg = placement ? plantColor! : baseBg;
          const hoverBg = shapeEditMode
            ? getCellHoverBg(cell)
            : (placement ? plantColor! : (cell.active ? '#c8e6c9' : baseBg));
          const placementOnInactive = !cell.active && !!placement;
          const opacity = placementOnInactive ? 0.4 : (cell.active ? 1 : 0.5);
          const border = placementOnInactive
            ? '1px dashed rgba(0,0,0,0.5)'
            : (placement ? '1px solid rgba(0,0,0,0.2)' : '1px solid rgba(0,0,0,0.1)');
          const commonSx = {
            width: cellSizePx,
            height: cellSizePx,
            bgcolor: bg,
            border,
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

          return (
            <Box
              key={`${r}-${c}`}
              onClick={cell.active && onCellClick ? () => onCellClick(r, c) : undefined}
              sx={{
                ...commonSx,
                ...(cell.active && { cursor: 'pointer' }),
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
