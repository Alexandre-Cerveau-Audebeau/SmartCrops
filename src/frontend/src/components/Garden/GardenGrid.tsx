import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import type { CellData } from '../../types/GardenLayout';

interface Props {
  grid: CellData[][];
  mode: 'shape' | 'garden' | 'soil';
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

export default function GardenGrid({ grid, mode, onCellClick, onCellDragStart, onCellDragEnter, onCellDragEnd, cellSizePx = 44 }: Props) {
  const { t } = useTranslation();
  const height = grid.length;
  const width = height > 0 ? grid[0].length : 0;
  const isShape = mode === 'shape';
  const hasDrag = isShape && onCellDragStart && onCellDragEnter && onCellDragEnd;

  useEffect(() => {
    if (!hasDrag || !onCellDragEnd) return;
    const handleMouseUp = () => onCellDragEnd();
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [hasDrag, onCellDragEnd]);

  return (
    <Box
      onMouseUp={hasDrag ? () => onCellDragEnd!() : undefined}
      onMouseLeave={hasDrag ? () => onCellDragEnd!() : undefined}
      sx={{
        display: 'inline-grid',
        gridTemplateColumns: `repeat(${width}, ${cellSizePx}px)`,
        border: '1px solid rgba(0,0,0,0.15)',
        borderRadius: 1,
        overflow: 'auto',
        ...(isShape && { userSelect: 'none' }),
      }}
    >
      {grid.flatMap((row, r) =>
        row.map((cell, c) => {
          const bg = getCellBg(cell);
          const hoverBg = getCellHoverBg(cell);
          const commonSx = {
            width: cellSizePx,
            height: cellSizePx,
            bgcolor: bg,
            border: '1px solid rgba(0,0,0,0.1)',
            transition: 'background-color 0.1s',
            opacity: cell.active ? 1 : 0.5,
            '&:hover': { bgcolor: isShape ? hoverBg : bg },
          };

          if (isShape) {
            return (
              <Box
                key={`${r}-${c}`}
                component="button"
                type="button"
                onMouseDown={hasDrag ? (e: React.MouseEvent) => { e.preventDefault(); onCellDragStart!(r, c); } : undefined}
                onMouseEnter={hasDrag ? () => onCellDragEnter!(r, c) : undefined}
                onTouchStart={hasDrag ? (e: React.TouchEvent) => { e.preventDefault(); onCellDragStart!(r, c); } : undefined}
                onClick={!hasDrag && onCellClick ? () => onCellClick(r, c) : undefined}
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
              />
            );
          }

          return (
            <Box key={`${r}-${c}`} sx={commonSx} />
          );
        }),
      )}
    </Box>
  );
}
