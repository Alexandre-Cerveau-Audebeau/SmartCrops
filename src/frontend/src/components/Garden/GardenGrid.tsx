import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import type { CellData } from '../../types/GardenLayout';
import type { ExposureCategory } from '../../utils/exposure';
import {
  groupInfrastructureRegions,
  INFRA_META,
  type InfraRegion,
} from '../../utils/infrastructure';
import { getPlannerTokens, type PlannerTokens } from '../../theme/plannerTokens';
import { getPlantColor } from '../../utils/plantColor';
import { Sym } from '../Sym';

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
  /**
   * Infrastructure paint mode (SMA-15 5.4): cells take the same drag-to-paint
   * wiring as shape-edit (the page routes the PAINT_* actions to the right
   * semantics via the reducer's mode state).
   */
  infraPaintMode?: boolean;
  placements?: PlacementOverlay[];
  /**
   * Exposure layer (SMA-17 5.3-D): the derived per-cell categories (null =
   * inactive cell). When present, each ACTIVE cell's fill/border become the
   * §3 category swatch (the layer IS the cell background — tokens doc §3);
   * placements still render on top unchanged. Absent/null = layer off.
   */
  exposure?: (ExposureCategory | null)[][] | null;
  /**
   * Cast shadows at the selected moment (SMA-15 5.4): cells shadowed by a
   * blocking infrastructure carry the §3/§9 "Ombre portée" hatch ON TOP of
   * their aggregate tint, so the moment preset visibly moves the shadow.
   */
  castShadow?: boolean[][] | null;
  /** The anchor element makes the cell-exposure popover attachable (5.3-D). */
  onCellClick?: (row: number, col: number, anchorEl?: HTMLElement) => void;
  onCellDragStart?: (row: number, col: number) => void;
  onCellDragEnter?: (row: number, col: number) => void;
  onCellDragEnd?: () => void;
  cellSizePx?: number;
}

// Base cells re-skinned to the design tokens (SMA-209: cellOn/cellOff exist
// in BOTH modes). Infrastructures no longer color the base cell (5.4): they
// render as §6 region blocks in the overlay layer; the soil colors stay the
// legacy hardcoded values (soils ship with their own chantier).
function getCellBg(cell: CellData, tk: PlannerTokens): string {
  if (!cell.active) return tk.cellOff;
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
  if (cell.soil) return getCellBg(cell, tk);
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
// The same gaps as numbers — the region overlay computes absolute geometry
// from them (cell tracks = cellSizePx + gap), per breakpoint like CELL_GAP.
const GAP_PX = { xs: 2, sm: 3 } as const;

/**
 * One §6 infrastructure block (SMA-15 5.4): a region of adjacent same-type
 * cells drawn as a SINGLE positioned block spanning the inter-cell gaps —
 * one perimeter border, the type's pattern, one centered icon (+ label when
 * the region is ≥ 4 cells wide, §6 rule). Rounded 29/15 px for eau/pot,
 * radius 5 for rectangles. Decorative (the cells beneath keep the accessible
 * names); pointer events pass through to the cells so painting still works.
 */
function InfraRegionBlock({
  region,
  cellSizePx,
  iconSize,
  tk,
  label,
}: {
  region: InfraRegion;
  cellSizePx: number;
  iconSize: number;
  tk: PlannerTokens;
  label: string;
}) {
  const style = tk.infra[region.type];
  const round = region.type === 'water' || region.type === 'pot';
  const showLabel = region.spanCols >= 4;
  const pos = (start: number, gap: number) => start * (cellSizePx + gap);
  const size = (span: number, gap: number) =>
    span * cellSizePx + (span - 1) * gap;
  return (
    <Box
      data-infra-region={region.type}
      sx={{
        position: 'absolute',
        left: {
          xs: `${pos(region.startCol, GAP_PX.xs)}px`,
          sm: `${pos(region.startCol, GAP_PX.sm)}px`,
        },
        top: {
          xs: `${pos(region.startRow, GAP_PX.xs)}px`,
          sm: `${pos(region.startRow, GAP_PX.sm)}px`,
        },
        width: {
          xs: `${size(region.spanCols, GAP_PX.xs)}px`,
          sm: `${size(region.spanCols, GAP_PX.sm)}px`,
        },
        height: {
          xs: `${size(region.spanRows, GAP_PX.xs)}px`,
          sm: `${size(region.spanRows, GAP_PX.sm)}px`,
        },
        boxSizing: 'border-box',
        bgcolor: style.bg,
        border: style.bd,
        ...(style.image && { backgroundImage: style.image }),
        ...(style.imageSize && { backgroundSize: style.imageSize }),
        // §6: radius rectangles 5px; formes rondes (eau, pot) 29px / 15px.
        borderRadius: round ? { xs: '15px', sm: '29px' } : '5px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        overflow: 'hidden',
      }}
    >
      <Sym name={INFRA_META[region.type].icon} size={iconSize} color={style.icon} />
      {showLabel && (
        <Box
          component="span"
          sx={{
            // §6: label fs 12 (9 mobile) w800 ls .02em.
            fontSize: { xs: 9, sm: 12 },
            fontWeight: 800,
            letterSpacing: '0.02em',
            color: style.label,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Box>
      )}
    </Box>
  );
}

export default function GardenGrid({ grid, shapeEditMode, infraPaintMode = false, placements, exposure, castShadow, onCellClick, onCellDragStart, onCellDragEnter, onCellDragEnd, cellSizePx = 44 }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const tk = getPlannerTokens(theme.palette.mode === 'dark' ? 'dark' : 'light');
  const height = grid.length;
  const width = height > 0 ? grid[0].length : 0;
  // Both paint modes share the drag wiring; the reducer routes the semantics.
  const paintMode = shapeEditMode || infraPaintMode;
  const hasDrag = paintMode && onCellDragStart && onCellDragEnter && onCellDragEnd;
  // §6 region blocks derived from the per-cell storage at render (SMA-15).
  const infraRegions = useMemo(() => groupInfrastructureRegions(grid), [grid]);
  // §6: icons fs 18 (14 mobile) — same breakpoint as the §4 cell metrics.
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const infraIconSize = isMobile ? 14 : 18;

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

    {/* §4: no hardcoded outer frame — the grid CARD provides it (R2).
        R5 (CR accept): valid ARIA hierarchy — role="grid" contains ONLY
        role="row" wrappers; every cell sits inside its row. Geometry is
        identical: a column of flex rows sharing CELL_GAP. */}
    {/* Relative wrapper (SMA-15 5.4): anchors the §6 infrastructure region
        overlay to the cell grid's origin. */}
    <Box sx={{ position: 'relative' }}>
    <Box
      role="grid"
      aria-label={t('planner.grid.label')}
      aria-rowcount={height}
      aria-colcount={width}
      onPointerUp={hasDrag ? () => onCellDragEnd!() : undefined}
      onPointerLeave={hasDrag ? () => onCellDragEnd!() : undefined}
      sx={{
        display: 'inline-flex',
        flexDirection: 'column',
        gap: CELL_GAP,
        ...(paintMode && { userSelect: 'none', touchAction: 'none' }),
      }}
    >
      {grid.map((row, r) => (
        <Box
          key={r}
          role="row"
          aria-rowindex={r + 1}
          sx={{ display: 'flex', gap: CELL_GAP }}
        >
        {row.map((cell, c) => {
          const placement = placementMap.get(`${r}-${c}`);
          const plantColor = placement ? getPlantColor(placement.plantId) : undefined;
          // Exposure tint (5.3-D): the category swatch REPLACES the cell's
          // fill/border (§3 "fill + border remplacent cell-on/cell-on-bd").
          // Placements render on top unchanged; inactive cells stay cellOff.
          const tint =
            exposure && cell.active && !placement
              ? (exposure[r]?.[c] ?? null)
              : null;
          // Cast shadow at the selected moment (5.4): the §9 "Ombre portée"
          // hatch rides ON TOP of the aggregate tint; placements stay
          // untouched (they render above the layer, 5.3-D contract).
          const cast = !!(
            exposure &&
            castShadow?.[r]?.[c] &&
            cell.active &&
            !placement
          );
          const baseBg = tint ? tk.expo[tint].fill : getCellBg(cell, tk);
          const bg = placement ? plantColor! : baseBg;
          const hoverBg = paintMode
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
            // "Ombre" AND "Ombre portée" carry the §3 hatch (§9) as the
            // cell's background-image — the cast overlay is what the
            // moment/season presets visibly move (5.4).
            ...((tint === 'shade' || cast) && { backgroundImage: tk.hatch }),
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
              // Above the §6 region overlay (5.4): a plant on a trellis
              // stays visible. `as const` keeps the literal narrow — the
              // standalone object has no SxProps context and a widened
              // `position: string` fails tsc at the sx spread site.
              position: 'relative' as const,
              zIndex: 2,
            }),
          };

          if (paintMode) {
            // The infra label ANNOUNCES the cell's current type (a paint tap
            // on a matching cell clears it — the toggle polarity).
            const paintLabel = shapeEditMode
              ? t('planner.cell.toggleCell')
              : cell.infrastructure
                ? `${t(`planner.infra.types.${cell.infrastructure}`)} — ${t('planner.cell.paintCell')}`
                : t('planner.cell.paintCell');
            return (
              <Box
                key={`${r}-${c}`}
                component="button"
                type="button"
                // R6 (CR accept): shape-edit buttons stay GRID CELLS for
                // assistive tech — the row's children are gridcells in both
                // modes; button behavior and label are unchanged. The infra
                // paint mode (5.4) reuses the same surface with its own label.
                role="gridcell"
                aria-colindex={c + 1}
                data-exposure={tint ?? undefined}
                data-cast-shadow={cast || undefined}
                onPointerDown={hasDrag ? (e: React.PointerEvent) => { e.preventDefault(); onCellDragStart!(r, c); } : undefined}
                onPointerEnter={hasDrag ? () => onCellDragEnter!(r, c) : undefined}
                // Keyboard path (5.4): Enter/Space fire a detail-0 click on a
                // real <button> — treated as a one-cell paint (start + end).
                // Pointer-driven clicks (detail > 0) are ignored: their
                // pointerdown already painted, a second toggle would undo it.
                onClick={hasDrag ? (e: React.MouseEvent) => {
                  if (e.detail === 0) {
                    onCellDragStart!(r, c);
                    onCellDragEnd!();
                  }
                } : undefined}
                aria-label={`${paintLabel} (${columnLabel(c)}${r + 1})`}
                sx={{
                  ...commonSx,
                  cursor: 'pointer',
                  p: 0,
                  outline: 'none',
                  '&:focus-visible': {
                    outline: '2px solid',
                    outlineColor: 'primary.main',
                    outlineOffset: -2,
                    // Above the §6 region overlay — the inset ring must stay
                    // visible on cells an opaque block covers.
                    position: 'relative' as const,
                    zIndex: 3,
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
              data-cast-shadow={cast || undefined}
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
                    : cell.infrastructure
                      ? t('planner.cell.infraCell', {
                          type: t(`planner.infra.types.${cell.infrastructure}`),
                          row: r + 1,
                          col: columnLabel(c),
                        })
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
        })}
        </Box>
      ))}
    </Box>
    {/* §6 infrastructure regions (SMA-15 5.4) — decorative overlay: ONE block
        per region (single perimeter border + centered icon/label), spanning
        the inter-cell gaps. Pointer events fall through to the cells (the
        paint surface); placement content raises above it via zIndex. The
        cells beneath keep the accessible names. */}
    {infraRegions.length > 0 && (
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
        }}
      >
        {infraRegions.map((region) => (
          <InfraRegionBlock
            key={`${region.type}-${region.startRow}-${region.startCol}`}
            region={region}
            cellSizePx={cellSizePx}
            iconSize={infraIconSize}
            tk={tk}
            label={t(`planner.infra.types.${region.type}`)}
          />
        ))}
      </Box>
    )}
    </Box>
      </Box>
    </Box>
  );
}
