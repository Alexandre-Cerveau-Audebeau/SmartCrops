import { memo, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';
import { alpha, useTheme } from '@mui/material/styles';
import type { CellData } from '../../types/GardenLayout';
import type { ExposureCategory } from '../../utils/exposure';
import {
  groupInfrastructureRegions,
  INFRA_META,
  type InfraRegion,
} from '../../utils/infrastructure';
import type { SoilType } from '../../utils/soil';
import { GAP_PX, getPlannerTokens, type PlannerTokens } from '../../theme/plannerTokens';
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
  /** Soil paint mode (SMA-14): same drag wiring, reducer-routed semantics. */
  soilPaintMode?: boolean;
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
  /**
   * Paint wiring (R4, GitHub Major 2955d067): every paint callback CARRIES
   * its pointer event so the page can bind the stroke to the pointer that
   * started it — before this, the end handlers did not even receive the
   * event, so any release anywhere in the window closed the stroke and a
   * second touch could re-lock the polarity mid-trace. The event is OPTIONAL
   * because the keyboard path (GridCell's detail-0 click) paints with no
   * pointer at all. Structural `{ pointerId }` — the page reads nothing
   * else, and both React and native pointer events satisfy it.
   */
  onCellDragStart?: (
    row: number,
    col: number,
    e?: { pointerId: number }
  ) => void;
  onCellDragEnter?: (
    row: number,
    col: number,
    e?: { pointerId: number }
  ) => void;
  onCellDragEnd?: (e?: { pointerId: number }) => void;
  cellSizePx?: number;
  /**
   * DnD (lot 2): raw pointerdown on a NON-paint cell — the page's drag
   * engine decides whether it becomes a move-drag (placement under the
   * cell, Place mode) or stays a click.
   */
  onCellPointerDown?: (row: number, col: number, e: React.PointerEvent) => void;
  /**
   * DnD (lot 2): the grid-snapped candidate rect under an active drag —
   * covered cells render the §7 target treatment (valid: dashed prim;
   * invalid: red hatch + dashed danger).
   */
  dragTarget?: {
    startRow: number;
    startCol: number;
    spanRows: number;
    spanCols: number;
    valid: boolean;
  } | null;
  /** DnD (lot 2): exposes the role="grid" element for pointer→cell math. */
  gridElRef?: (el: HTMLDivElement | null) => void;
}

// Base cells re-skinned to the design tokens (SMA-209: cellOn/cellOff exist
// in BOTH modes). Infrastructures no longer color the base cell (5.4): they
// render as §6 region blocks in the overlay layer. Soil no longer colors it
// either (SMA-14): the background is the EXPOSURE layer's exclusive property
// (§15) — soil expresses itself as the trame + pastille, which retired the
// legacy three-colour fill that used to live here.
function getCellBg(cell: CellData, tk: PlannerTokens): string {
  if (!cell.active) return tk.cellOff;
  return tk.cellOn;
}

// Hover cues: the tokens doc defines no hover fills, so the nearest existing
// shade is reused — the matching border token, one step off the base fill in
// BOTH modes (never an invented hex, and never the legacy light-green flash
// on the night palette).
function getCellHoverBg(cell: CellData, tk: PlannerTokens): string {
  if (!cell.active) return tk.cellOffBd;
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
// §4: inter-cell gap 3 px desktop / 2 px mobile — ONE numeric source (R5,
// CR accept): the overlays compute absolute geometry from these numbers and
// the flex grid + axis rails consume the DERIVED sx strings below, so the
// two can never drift.
// §4 gap now lives in plannerTokens (lot 2 — react-refresh forbids
// non-component exports here); the CELL_GAP css strings stay derived.
const CELL_GAP = { xs: `${GAP_PX.xs}px`, sm: `${GAP_PX.sm}px` } as const;

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

/**
 * One PLANT block (SMA-15 R4, mockup §5): every plant renders as an
 * absolutely-positioned rounded block over its footprint, slightly INSET so
 * the cell's own type (base / infra / exposure) shows around it — never a
 * full-cell fill, never a circle. Same shape everywhere; the only contextual
 * difference is the FILL: solid plantColor on bare cells, the R3 translucent
 * alpha over an infrastructure (the pattern shows through), with the R3
 * letter halo in that case. Ring + shadow reuse the R2/R3 token values
 * (tk.card ring, shared switch-thumb shadow). Geometry mirrors
 * InfraRegionBlock but with RESOLVED numbers (the page's own breakpoint),
 * radius 7px per the mockup. Decorative overlay — cells keep the accessible
 * names and all pointer behavior.
 */
function PlantBlock({
  placement,
  cellSizePx,
  gapPx,
  insetPx,
  translucent,
  dimmed,
  tk,
}: {
  placement: PlacementOverlay;
  cellSizePx: number;
  gapPx: number;
  insetPx: number;
  translucent: boolean;
  dimmed: boolean;
  tk: PlannerTokens;
}) {
  const color = getPlantColor(placement.plantId);
  const letter = placement.plantName
    ? placement.plantName.charAt(0).toUpperCase()
    : null;
  const track = cellSizePx + gapPx;
  const span = (cells: number) => cells * cellSizePx + (cells - 1) * gapPx;
  return (
    <Box
      data-plant-block
      sx={{
        position: 'absolute',
        left: `${placement.startCol * track + insetPx}px`,
        top: `${placement.startRow * track + insetPx}px`,
        width: `${span(placement.spanCols) - 2 * insetPx}px`,
        height: `${span(placement.spanRows) - 2 * insetPx}px`,
        boxSizing: 'border-box',
        bgcolor: translucent ? alpha(color, 0.6) : color,
        border: `2px solid ${tk.card}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        borderRadius: '7px', // mockup §5: bloc plante radius 7px
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: { xs: 12, sm: 16 }, // §5: lettre fs 16 (desktop)
        fontWeight: 800, // §5: w800
        color: 'rgba(0,0,0,0.6)',
        ...(translucent && {
          textShadow: '0 0 3px rgba(255,255,255,0.85)',
        }),
        // The placement-on-inactive anomaly keeps reading as dimmed (R4:
        // block-level — any footprint cell inactive).
        ...(dimmed && { opacity: 0.4 }),
        zIndex: 2,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {letter}
    </Box>
  );
}

/**
 * One grid cell, MEMOIZED (perf round, lot 2 R2): during a drag the page
 * re-renders once per traversed cell, but every prop here is a stable
 * primitive/reference EXCEPT `targetState` on the cells entering/leaving the
 * candidate rect — so of the ~500 cells only that handful re-renders (the
 * measured lag was all ~500 cells rebuilding their sx per traversed cell).
 * The DOM/aria output is byte-identical to the pre-extraction inline cells.
 */
const GridCell = memo(function GridCell({
  cell,
  r,
  c,
  paintMode,
  shapeEditMode,
  soilPaintMode,
  hasDrag,
  tint,
  cast,
  hasPlacement,
  placementName,
  targetState,
  cellSizePx,
  tk,
  onCellClick,
  onCellDragStart,
  onCellDragEnter,
  onCellDragEnd,
  onCellPointerDown,
}: {
  cell: CellData;
  r: number;
  c: number;
  paintMode: boolean;
  shapeEditMode: boolean;
  /** SMA-14: soil paint mode — picks the soil paint label over the infra one. */
  soilPaintMode: boolean;
  hasDrag: boolean;
  tint: ExposureCategory | null;
  cast: boolean;
  hasPlacement: boolean;
  placementName?: string;
  targetState: 'valid' | 'invalid' | null;
  cellSizePx: number;
  tk: PlannerTokens;
  onCellClick?: (row: number, col: number, anchorEl?: HTMLElement) => void;
  onCellDragStart?: (
    row: number,
    col: number,
    e?: { pointerId: number }
  ) => void;
  onCellDragEnter?: (
    row: number,
    col: number,
    e?: { pointerId: number }
  ) => void;
  onCellDragEnd?: (e?: { pointerId: number }) => void;
  onCellPointerDown?: (row: number, col: number, e: React.PointerEvent) => void;
}) {
  const { t } = useTranslation();
  const baseBg = tint ? tk.expo[tint].fill : getCellBg(cell, tk);
  const placementOnInactive = !cell.active && hasPlacement;
  const opacity = placementOnInactive ? 0.4 : (cell.active ? 1 : 0.5);
  // Cell borders mapped to tokens (R2): the anomaly marker (placement on an
  // inactive cell) keeps the strong `muted` dashed; every other cell takes
  // the generic token border — the plant is an OVERLAY since R4 and never
  // restyles its cells.
  const border = placementOnInactive
    ? `1px dashed ${tk.muted}`
    : `1px solid ${
        tint
          ? tk.expo[tint].border
          : cell.active
            ? tk.cellOnBd
            : tk.cellOffBd
      }`;
  // §15 trame (SMA-14): soil is a background-image on the CELL — under every
  // overlay, so it sits below the plant blocks naturally. The §3 hatch
  // COMPOSES with it as a comma list, hatch FIRST (the first background
  // paints on top: the shadow reads as a wash over the soil, not under it).
  // DnD target states win outright — a targeted cell shows target feedback,
  // not soil (excluding soil here also keeps the invalid redHatch spread
  // below from inheriting the trame's background-size). Infra cells carry no
  // trame (infrastructure masks soil entirely, §15) and neither do inactive
  // cells (they render cellOff; painting is active-only).
  const soilStyle =
    targetState === null && cell.active && cell.soil && !cell.infrastructure
      ? tk.soil[cell.soil]
      : null;
  const hatched = tint === 'shade' || cast;
  const commonSx = {
    width: cellSizePx,
    height: cellSizePx,
    bgcolor: baseBg,
    // "Ombre" AND "Ombre portée" carry the §3 hatch (§9) as the cell's
    // background-image — the cast overlay is what the moment/season presets
    // visibly move (5.4).
    ...(hatched && !soilStyle && { backgroundImage: tk.hatch }),
    ...(soilStyle && {
      backgroundImage: hatched
        ? `${tk.hatch}, ${soilStyle.image}`
        : soilStyle.image,
      backgroundSize: hatched
        ? `auto, ${soilStyle.imageSize}`
        : soilStyle.imageSize,
      ...(soilStyle.imagePosition && {
        backgroundPosition: hatched
          ? `0% 0%, ${soilStyle.imagePosition}`
          : soilStyle.imagePosition,
      }),
    }),
    border,
    borderRadius: '4px', // §4: radius cellule 4px (border 1px)
    transition: 'background-color 0.1s',
    opacity,
    // DnD target rect (lot 2, §7): valid = 2px dashed prim + light green
    // fill (tk.cellOn — §7's "fond vert léger", no new hex); invalid = §3
    // red hatch + 2px dashed danger.
    ...(targetState === 'valid'
      ? { bgcolor: tk.cellOn, border: `2px dashed ${tk.prim}` }
      : targetState === 'invalid'
        ? { backgroundImage: tk.redHatch, border: `2px dashed ${tk.dangTx}` }
        : undefined),
    '&:hover': {
      bgcolor: paintMode
        ? getCellHoverBg(cell, tk)
        : cell.active && !tint
          ? tk.cellOnBd
          : baseBg,
    },
  };

  if (paintMode) {
    // The infra/soil label ANNOUNCES the cell's current type (a paint tap on
    // a matching cell clears it — the toggle polarity).
    const paintLabel = shapeEditMode
      ? t('planner.cell.toggleCell')
      : soilPaintMode
        ? cell.soil
          ? `${t(`planner.soil.types.${cell.soil}`)} — ${t('planner.cell.paintSoil')}`
          : t('planner.cell.paintSoil')
        : cell.infrastructure
          ? `${t(`planner.infra.types.${cell.infrastructure}`)} — ${t('planner.cell.paintCell')}`
          : t('planner.cell.paintCell');
    return (
      <Box
        component="button"
        type="button"
        // R6 (CR accept): shape-edit buttons stay GRID CELLS for assistive
        // tech — the row's children are gridcells in both modes; button
        // behavior and label are unchanged. The infra paint mode (5.4)
        // reuses the same surface with its own label.
        role="gridcell"
        aria-colindex={c + 1}
        data-exposure={tint ?? undefined}
        data-cast-shadow={cast || undefined}
        onPointerDown={hasDrag ? (e: React.PointerEvent) => { e.preventDefault(); onCellDragStart!(r, c, e); } : undefined}
        onPointerEnter={hasDrag ? (e: React.PointerEvent) => onCellDragEnter!(r, c, e) : undefined}
        // Keyboard path (5.4): Enter/Space fire a detail-0 click on a real
        // <button> — treated as a one-cell paint (start + end). Pointer
        // clicks (detail > 0) are ignored: their pointerdown already
        // painted, a second toggle would undo it.
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
      />
    );
  }

  const interactive = (cell.active || hasPlacement) && !!onCellClick;
  return (
    <Box
      role="gridcell"
      data-exposure={tint ?? undefined}
      data-cast-shadow={cast || undefined}
      // R3 (CR accept): screen-reader coordinates match the VISIBLE axes —
      // one-based rows, letter columns, plus explicit indices.
      aria-rowindex={r + 1}
      aria-colindex={c + 1}
      tabIndex={interactive ? 0 : -1}
      // DnD (lot 2): raw pointerdown feeds the page's drag engine
      // (move-drag arming); plain clicks keep their behavior below.
      onPointerDown={onCellPointerDown ? (e: React.PointerEvent) => onCellPointerDown(r, c, e) : undefined}
      onClick={interactive ? (e: React.MouseEvent<HTMLElement>) => onCellClick!(r, c, e.currentTarget) : undefined}
      onKeyDown={interactive ? (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onCellClick!(r, c, e.currentTarget);
        }
      } : undefined}
      aria-label={
        cell.active
          ? placementName && cell.infrastructure
            // R5 (CR accept): a plant OVER an infrastructure announces BOTH.
            ? t('planner.cell.plantedInfraCell', {
                plant: placementName,
                type: t(`planner.infra.types.${cell.infrastructure}`),
                row: r + 1,
                col: columnLabel(c),
              })
            // R3 (triply convergent Minor): the pastille renders ABOVE the
            // plant block precisely so a planted cell keeps its soil
            // identifiable — the label says what the pastille shows. The
            // infra combination cannot reach here (the branch above wins),
            // so soil is never announced under a masking infrastructure.
            : placementName && cell.soil
              ? t('planner.cell.plantedSoilCell', {
                  plant: placementName,
                  type: t(`planner.soil.types.${cell.soil}`),
                  row: r + 1,
                  col: columnLabel(c),
                })
              : placementName
                ? t('planner.cell.plantedCell', { plant: placementName, row: r + 1, col: columnLabel(c) })
              : cell.infrastructure
                // R2 (the GitHub Minor's test applied to every combination):
                // the TRELLIS is the one §6 type whose fill is translucent in
                // BOTH palettes (0.08/0.10) — the tint genuinely shows
                // through the lattice, so it is announced too. Wall, fence
                // and path are opaque hexes in both modes (occluded → type
                // only); water and pot are opaque by day and translucent by
                // night, and an aria label must not vary with the palette,
                // so they keep the type-only label (declared).
                ? cell.infrastructure === 'trellis' && tint
                  ? t('planner.cell.infraExposureCell', {
                      type: t(`planner.infra.types.${cell.infrastructure}`),
                      category: t(`planner.exposure.categories.${tint}`),
                      row: r + 1,
                      col: columnLabel(c),
                    })
                  : t('planner.cell.infraCell', {
                      type: t(`planner.infra.types.${cell.infrastructure}`),
                      row: r + 1,
                      col: columnLabel(c),
                    })
                // SMA-14 R2 (GitHub Minor): soil and a tint are visible AT
                // THE SAME TIME — the tint is the cell background, the trame
                // sits on top — unlike a plant or an opaque infrastructure
                // whose block covers the cell. Both signals are announced;
                // soil-only and tint-only keep their existing labels.
                : cell.soil
                  ? tint
                    ? t('planner.cell.soilExposureCell', {
                        type: t(`planner.soil.types.${cell.soil}`),
                        category: t(`planner.exposure.categories.${tint}`),
                        row: r + 1,
                        col: columnLabel(c),
                      })
                    : t('planner.cell.soilCell', {
                        type: t(`planner.soil.types.${cell.soil}`),
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
        // Extension (lot 2 R1): a touch move-drag must feed the pointer engine, not scroll the page.
        ...(hasPlacement && onCellPointerDown && { touchAction: 'none' }),
        '&:focus-visible': interactive ? {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: -2,
          // R5 (CR accept): same elevation as the paint branch — the inset
          // ring must stay visible above an opaque §6 region.
          position: 'relative' as const,
          zIndex: 3,
        } : undefined,
      }}
    />
  );
});

function GardenGrid({ grid, shapeEditMode, infraPaintMode = false, soilPaintMode = false, placements, exposure, castShadow, onCellClick, onCellDragStart, onCellDragEnter, onCellDragEnd, cellSizePx = 44, onCellPointerDown, dragTarget = null, gridElRef }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const tk = getPlannerTokens(theme.palette.mode === 'dark' ? 'dark' : 'light');
  const height = grid.length;
  const width = height > 0 ? grid[0].length : 0;
  // All three paint modes share the drag wiring; the reducer routes the
  // semantics.
  const paintMode = shapeEditMode || infraPaintMode || soilPaintMode;
  const hasDrag = paintMode && onCellDragStart && onCellDragEnter && onCellDragEnd;
  // §6 region blocks derived from the per-cell storage at render (SMA-15).
  const infraRegions = useMemo(() => groupInfrastructureRegions(grid), [grid]);
  // §6: icons fs 18 (14 mobile) — same breakpoint as the §4 cell metrics.
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const infraIconSize = isMobile ? 14 : 18;
  // Plant-overlay geometry (R4): the §4 gap and the mockup's ~5px block
  // inset, resolved at the same breakpoint (3px inset mobile — scaled).
  const overlayGapPx = isMobile ? GAP_PX.xs : GAP_PX.sm;
  const plantInsetPx = isMobile ? 3 : 5;
  /** §15 pastille edge (SMA-14) — PROPORTIONAL, not fixed: the design
   * component draws 11 px on a 68 px cell (≈ 16 % of the edge). A fixed
   * 11 px would eat 37 % of a 30 px mobile cell; a pure 16 % would shrink
   * to 5 px there. The 7 px floor (≈ 23 % at 30 px) keeps the dot readable
   * because at small sizes the pastille CARRIES the identification (SMA-14
   * ruling) — the trame is only a reminder. */
  const pastilleSize = Math.max(7, Math.round(cellSizePx * 0.16));
  /** §15: the dot's corner offset — the component's 3 px at 68 px (≈ 4.5 %). */
  const pastilleInset = Math.max(2, Math.round(cellSizePx * 0.045));
  /** §15: the dot's rounding — the component's 3.5 px on 11 px (≈ 32 %). */
  const pastilleRadius = Math.round(pastilleSize * 0.32);
  /** §15: one dot per active, non-infra soil cell — infrastructure masks
   * soil entirely (no trame, no pastille) and inactive cells carry neither
   * (same gating as GridCell's trame). */
  const soilPastilles = useMemo(() => {
    const out: Array<{ r: number; c: number; soil: SoilType }> = [];
    grid.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell.active && cell.soil && !cell.infrastructure) {
          out.push({ r, c, soil: cell.soil });
        }
      })
    );
    return out;
  }, [grid]);
  // Per-placement fill context (R4): translucent when ANY footprint cell
  // carries an infrastructure (the pattern must show through wherever the
  // block overlaps it); dimmed when ANY footprint cell is inactive (the
  // pre-existing anomaly semantics, block-level).
  const placementContext = (p: PlacementOverlay) => {
    let onInfra = false;
    let onInactive = false;
    for (let r = p.startRow; r < p.startRow + p.spanRows; r++) {
      for (let c = p.startCol; c < p.startCol + p.spanCols; c++) {
        const cell = grid[r]?.[c];
        if (!cell) continue;
        if (cell.infrastructure && cell.active) onInfra = true;
        if (!cell.active) onInactive = true;
      }
    }
    return { onInfra, onInactive };
  };

  useEffect(() => {
    if (!hasDrag || !onCellDragEnd) return;
    // R4: the event is FORWARDED — the page ends the stroke only on its
    // OWNER's release. The old zero-argument form meant any pointer's
    // release anywhere in the window closed any live stroke.
    const handlePointerUp = (e: PointerEvent) => onCellDragEnd(e);
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
      ref={gridElRef}
      aria-label={t('planner.grid.label')}
      aria-rowcount={height}
      aria-colcount={width}
      onPointerUp={hasDrag ? (e: React.PointerEvent) => onCellDragEnd!(e) : undefined}
      onPointerLeave={hasDrag ? (e: React.PointerEvent) => onCellDragEnd!(e) : undefined}
      sx={{
        display: 'inline-flex',
        flexDirection: 'column',
        gap: CELL_GAP,
        // SMA-18 lot 2: the clamp follows the DRAG WIRING (the lot-1 sidebar
        // pattern), not the mode flag alone — a paint mode's finger paints
        // (pointerdown paints instantly, so the gesture can never double as
        // a scroll), while Selection/Place keep the root unclamped and a
        // finger scrolls the grid. Place-mode move-drags keep their own
        // PER-CELL clamp in GridCell, independent of this one.
        ...(hasDrag && { userSelect: 'none', touchAction: 'none' }),
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
          // Exposure tint (5.3-D, revised R4) + cast shadow (5.4): derived
          // here (stable primitives) and passed as scalar props so the
          // memoized cell only re-renders when ITS inputs change.
          const tint =
            exposure && cell.active ? (exposure[r]?.[c] ?? null) : null;
          const cast = !!(exposure && castShadow?.[r]?.[c] && cell.active);
          // DnD target rect (lot 2, §7) → per-cell scalar: only cells
          // entering/leaving the rect see a prop change during a drag —
          // the perf-round fix (R2): the other ~500 cells bail out in memo.
          const targetState =
            dragTarget &&
            r >= dragTarget.startRow &&
            r < dragTarget.startRow + dragTarget.spanRows &&
            c >= dragTarget.startCol &&
            c < dragTarget.startCol + dragTarget.spanCols
              ? dragTarget.valid
                ? ('valid' as const)
                : ('invalid' as const)
              : null;
          return (
            <GridCell
              key={`${r}-${c}`}
              cell={cell}
              r={r}
              c={c}
              paintMode={paintMode}
              shapeEditMode={shapeEditMode}
              soilPaintMode={soilPaintMode}
              hasDrag={!!hasDrag}
              tint={tint}
              cast={cast}
              hasPlacement={!!placement}
              placementName={placement?.plantName}
              targetState={targetState}
              cellSizePx={cellSizePx}
              tk={tk}
              onCellClick={onCellClick}
              onCellDragStart={onCellDragStart}
              onCellDragEnter={onCellDragEnter}
              onCellDragEnd={onCellDragEnd}
              onCellPointerDown={onCellPointerDown}
            />
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
    {/* Plant blocks (SMA-15 R4, mockup §5) — the unified inset rounded
        overlay, ONE block per placement footprint, above the infra layer.
        Decorative: cells keep the accessible names and pointer behavior. */}
    {placements && placements.length > 0 && (
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
        {placements.map((p) => {
          const context = placementContext(p);
          return (
            <PlantBlock
              key={`${p.plantId}-${p.startRow}-${p.startCol}`}
              placement={p}
              cellSizePx={cellSizePx}
              gapPx={overlayGapPx}
              insetPx={plantInsetPx}
              translucent={context.onInfra}
              dimmed={context.onInactive}
              tk={tk}
            />
          );
        })}
      </Box>
    )}
    {/* §15 soil pastilles (SMA-14) — the corner identity dot ABOVE the plant
        blocks (zIndex 3, the focus-ring precedent — plant blocks sit at 2):
        a planted cell keeps its soil identifiable. Decorative overlay —
        aria-hidden, pointer events fall through to the cells (the soil info
        reaches AT through the cell labels and the placement panel). */}
    {soilPastilles.length > 0 && (
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          zIndex: 3,
        }}
      >
        {soilPastilles.map(({ r, c, soil }) => {
          // R4 (GitHub outside-diff): drag-target feedback wins OUTRIGHT —
          // the R1 ruling GridCell already applies to the trame, applied to
          // its twin. Deliberately RENDER-TIME rather than a dragTarget dep
          // on the memo: dragTarget changes once per traversed cell, so a
          // dep would re-walk the whole grid per traversal — the exact
          // per-drag O(grid) pattern the DnD perf round measured and
          // removed. This per-pastille bounds check rides a render that
          // happens anyway (the overlay re-renders with the page), like the
          // trame's own targetState check in commonSx.
          if (
            dragTarget &&
            r >= dragTarget.startRow &&
            r < dragTarget.startRow + dragTarget.spanRows &&
            c >= dragTarget.startCol &&
            c < dragTarget.startCol + dragTarget.spanCols
          ) {
            return null;
          }
          return (
          <Box
            key={`${r}-${c}`}
            data-soil-pastille={soil}
            sx={{
              position: 'absolute',
              // §15: bas-gauche (the component's left:3px; bottom:3px at
              // 68 px, made proportional above).
              left: `${c * (cellSizePx + overlayGapPx) + pastilleInset}px`,
              top: `${r * (cellSizePx + overlayGapPx) + cellSizePx - pastilleSize - pastilleInset}px`,
              width: `${pastilleSize}px`,
              height: `${pastilleSize}px`,
              boxSizing: 'border-box',
              borderRadius: `${pastilleRadius}px`,
              bgcolor: tk.soil[soil].pastille,
              border: `1px solid ${tk.soilPastilleBd}`,
            }}
          />
          );
        })}
      </Box>
    )}
    </Box>
      </Box>
    </Box>
  );
}

// Memoized export (perf round): during a drag only `dragTarget` changes —
// the grid re-render is cheap once the cells bail out via GridCell's memo.
export default memo(GardenGrid);
