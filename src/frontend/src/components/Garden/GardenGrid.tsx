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

/** Spreadsheet-style column label (A…Z, AA…) for the §4 axes. */
function columnLabel(index: number): string {
  let label = '';
  let i = index;
  do {
    label = String.fromCharCode(65 + (i % 26)) + label;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return label;
}

// §4 axes: fs 10.5 (8.5 mobile) · w700 · --muted. The rail width is layout
// plumbing (not a doc token): 18 px fits two digits at fs 10.5.
const AXIS_RAIL_PX = 18;
const axisLabelSx = {
  fontSize: { xs: 8.5, sm: 10.5 },
  fontWeight: 700,
} as const;
// §4: inter-cell gap 3 px desktop / 2 px mobile — shared by the cell grid and
// both axis rails so the labels track the cell tracks at any zoom.
const CELL_GAP = { xs: '2px', sm: '3px' } as const;

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
    <Box sx={{ display: 'inline-flex', flexDirection: 'column' }}>
      {/* Column letters (§4 axes) — presentational: the grid itself already
          carries aria-rowcount/colcount. ml = rail width + cell gap so the
          letters align to the cell tracks. */}
      <Box
        aria-hidden
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${width}, ${cellSizePx}px)`,
          gap: CELL_GAP,
          ml: { xs: `${AXIS_RAIL_PX + 2}px`, sm: `${AXIS_RAIL_PX + 3}px` },
          mb: '2px',
          color: tk.muted,
        }}
      >
        {Array.from({ length: width }, (_, c) => (
          <Box key={c} sx={{ ...axisLabelSx, textAlign: 'center' }}>
            {columnLabel(c)}
          </Box>
        ))}
      </Box>

      <Box sx={{ display: 'inline-flex', gap: CELL_GAP }}>
        {/* Row numbers (§4 axes) — same presentational treatment. */}
        <Box
          aria-hidden
          sx={{
            display: 'grid',
            gridTemplateRows: `repeat(${height}, ${cellSizePx}px)`,
            gap: CELL_GAP,
            width: AXIS_RAIL_PX,
            color: tk.muted,
          }}
        >
          {Array.from({ length: height }, (_, r) => (
            <Box
              key={r}
              sx={{
                ...axisLabelSx,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {r + 1}
            </Box>
          ))}
        </Box>

    {/* §4: no hardcoded outer frame — the grid CARD provides it (R2). */}
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
        gap: CELL_GAP,
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
          // Placement borders mapped to tokens (R2): the anomaly marker
          // (placement on an inactive cell) uses the strong `muted` dashed;
          // a normal placement gets the subtle active-cell border. No hex
          // invention — both are existing mode-aware tokens.
          const border = placementOnInactive
            ? `1px dashed ${tk.muted}`
            : placement
              ? `1px solid ${tk.cellOnBd}`
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
                aria-label={`${t('planner.cell.toggleCell')} (${columnLabel(c)}${r + 1})`}
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
              // R3 (CR accept): screen-reader coordinates match the VISIBLE
              // axes — one-based rows, letter columns, plus explicit indices.
              aria-rowindex={r + 1}
              aria-colindex={c + 1}
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
                  ? placement?.plantName
                    ? t('planner.cell.plantedCell', { plant: placement.plantName, row: r + 1, col: columnLabel(c) })
                    : tint
                      ? t('planner.cell.exposureCell', {
                          category: t(`planner.exposure.categories.${tint}`),
                          row: r + 1,
                          col: columnLabel(c),
                        })
                      : t('planner.cell.emptyCell', { row: r + 1, col: columnLabel(c) })
                  : t('planner.cell.inactiveCell', { row: r + 1, col: columnLabel(c) })
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
      </Box>
    </Box>
  );
}
