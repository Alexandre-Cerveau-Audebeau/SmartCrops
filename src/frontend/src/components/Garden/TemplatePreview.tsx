import { memo, useMemo } from 'react';
import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';
import { usePlannerTokens } from '../../theme/usePlannerTokens';
import {
  fitPreviewBox,
  plantInsetPx,
  type PreviewFit,
} from '../../utils/gardenPreview';
import {
  templateGrid,
  type GardenTemplate,
  type PreviewPlan,
} from '../../utils/gardenTemplates';
import { getPlantColor } from '../../utils/plantColor';

interface CommonProps {
  /**
   * Cell fill and grid frame, when the surface behind the thumbnail is not the
   * planner's. The dashboard passes its own: the frozen design gives the widget
   * card a lighter night cell, because the planner's reads as an empty
   * rectangle at 2 px per cell.
   */
  cellColors?: { on: string; frame: string };
}

/** The template picker: one of the three templates, at a fixed cell size. */
interface PickerProps extends CommonProps {
  template: GardenTemplate;
  /**
   * Resolves a scientific name to the catalog id the plant will carry once
   * the template is applied (the page's map). Unresolved (or no resolver):
   * the name itself feeds the colour hash, so the preview is stable before
   * the catalog lands and identical to the placed block afterwards.
   */
  resolvePlantId?: (scientificName: string) => string | undefined;
  /** Edge of one preview cell, in px. */
  cellPx?: number;
  fitTo?: undefined;
}

/** A real garden fitted to a box (SMA-336 PR 2/5): colour keys already final. */
interface FittedProps extends CommonProps {
  template: PreviewPlan;
  /**
   * Draw the whole plan inside this box instead of at a fixed cell size.
   * Opt-in: without it the component behaves exactly as the template picker
   * has always had it.
   *
   * The cell and the gap are measured together by `fitPreview` — see there for
   * why one cannot be derived from the other.
   */
  fitTo: { maxW: number; maxH: number };
  resolvePlantId?: never;
  cellPx?: never;
}

/**
 * The two modes are separate by TYPE, not by convention (round 1, E21).
 *
 * A template's placement carries a scientific name; a real garden's carries a
 * plant ID. They used to be the same field on the same interface, and this
 * component fed that field to `resolvePlantId` — a name -> id map. Handed an ID
 * it resolved nothing, fell through, and the plant silently changed colour;
 * nothing in the old signature flagged the combination.
 *
 * `TemplatePlacement` and `PreviewPlacement` are now two types, and each mode
 * accepts only the plan that produces its own kind. A fitted plan has no
 * `scientificName` for a resolver to read, and no resolver to hand it to.
 */
type Props = PickerProps | FittedProps;

/** The §15 soil hue shown as a wash over the cell — the pastille hue at the
 * trame's own day opacity, so a soil reads at 16 px without its pattern. */
const SOIL_WASH_OPACITY = 0.38;

/** Preview gap between cells, in px (the §4 gap scaled to the thumbnail). */
const PREVIEW_GAP_PX = 1;

/** Cell edge the template picker draws at when it names none. */
const DEFAULT_CELL_PX = 16;

/**
 * SMA-18 lot 2: a template's thumbnail — rows × cols rectangles coloured from
 * the planner tokens (cell on/off, §6 infrastructure fills, §15 soil hues) with
 * one rectangle per placement on top (the placement's own plant colour). Pure
 * and DECORATIVE: `aria-hidden`, no roles, no pointer events — the card that
 * hosts it carries the accessible name. Deliberately NOT GardenGrid: that
 * component is interactive (role="grid", one gridcell per cell, axis rails,
 * 14–18 px icons, 7 px pastilles) and unreadable below ~30 px per cell.
 */
function TemplatePreview(props: Props) {
  const { template, cellColors } = props;
  const tk = usePlannerTokens();

  // MEMOIZED on the plan (round 1, E14, interim measure). `templateGrid`
  // allocates one object per cell of the whole plan — 1 200 for a 40 × 30
  // garden, 10 000 at the layout ceiling — and it ran on every render. This
  // component is `memo`'d, but both call sites pass `fitTo` as an inline object
  // literal, so its props are never referentially equal and the memo never held.
  const grid = useMemo(() => templateGrid(template), [template]);

  // Fitting is opt-in, and when it is off NOTHING below changes: the same fixed
  // cell, the same one-pixel gap, the same 2 px plant inset the template picker
  // has always drawn.
  //
  // Depends on the two NUMBERS rather than on the `fitTo` object, for the same
  // reason: the object is rebuilt by the caller on every render.
  const maxW = props.fitTo?.maxW;
  const maxH = props.fitTo?.maxH;
  const cellPx = props.cellPx;
  const box = useMemo(
    () =>
      maxW !== undefined && maxH !== undefined
        ? fitPreviewBox(template.cols, template.rows, maxW, maxH)
        : null,
    [template.cols, template.rows, maxW, maxH]
  );
  const fit: PreviewFit = box ?? {
    cellPx: cellPx ?? DEFAULT_CELL_PX,
    gapPx: PREVIEW_GAP_PX,
  };
  const inset = plantInsetPx(fit.cellPx);

  // A fitted plan STAYS IN ITS BOX (round 8 — the overflow half of Extension
  // #9-16, raised in round 7 § 5). `fitPreview` floors the cell at one pixel,
  // so a plan with more columns or rows than the box has pixels was drawn past
  // the box — 100 × 100 px for the layout ceiling in a 48 px thumbnail — and
  // `width: fit-content` let the overrun push the card and the table row. The
  // grid below is untouched: the same tracks, the same one node per cell the
  // cost measurement pins. It is DRAWN scaled, from its top-left corner, into
  // a box of the scaled size — the layout sees the box, the eye sees the whole
  // plan downsampled into it. See `fitPreviewBox` for why a scale and not a
  // crop.
  const bounded =
    box && box.scale < 1
      ? {
          width: box.width,
          height: box.height,
          transform: `scale(${box.scale})`,
          transformOrigin: 'top left',
        }
      : { width: 'fit-content' };

  /**
   * The string `getPlantColor` hashes for one block.
   *
   * The branch is on the MODE, so each placement kind is read by the only code
   * that can read it (round 1, E21): a fitted plan's key is already final, a
   * template's is a scientific name the picker resolves to the id the plant
   * will carry once applied.
   */
  const plantColorKey = (index: number): string => {
    if (props.fitTo) return props.template.placements[index].plantKey;
    const { scientificName } = props.template.placements[index];
    return props.resolvePlantId?.(scientificName) ?? scientificName;
  };

  return (
    <Box
      aria-hidden
      data-testid="template-preview"
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${template.cols}, ${fit.cellPx}px)`,
        gridTemplateRows: `repeat(${template.rows}, ${fit.cellPx}px)`,
        gap: `${fit.gapPx}px`,
        p: `${fit.gapPx}px`,
        bgcolor: cellColors?.frame ?? tk.cellOnBd,
        borderRadius: '6px',
        ...bounded,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {grid.map((row, r) =>
        row.map((cell, c) => {
          const kind = !cell.active
            ? 'inactive'
            : cell.infrastructure
              ? `infra:${cell.infrastructure}`
              : cell.soil
                ? `soil:${cell.soil}`
                : 'empty';
          const bg = !cell.active
            ? tk.cellOff
            : cell.infrastructure
              ? tk.infra[cell.infrastructure].bg
              : (cellColors?.on ?? tk.cellOn);
          // Soil shows only where the grid would show it: an active cell with
          // no infrastructure on top (§15 — infrastructure masks soil).
          const wash =
            cell.active && !cell.infrastructure && cell.soil
              ? alpha(tk.soil[cell.soil].pastille, SOIL_WASH_OPACITY)
              : null;
          return (
            <Box
              key={`${r}-${c}`}
              data-testid="template-preview-cell"
              data-cell-kind={kind}
              sx={{
                gridRow: r + 1,
                gridColumn: c + 1,
                bgcolor: bg,
                ...(wash && {
                  backgroundImage: `linear-gradient(${wash}, ${wash})`,
                }),
                borderRadius: '2px',
              }}
            />
          );
        })
      )}
      {template.placements.map((placement, i) => (
        <Box
          key={i}
          data-testid="template-preview-plant"
          sx={{
            gridRow: `${placement.row + 1} / span ${placement.spanRows}`,
            gridColumn: `${placement.col + 1} / span ${placement.spanCols}`,
            // Conditional, per the frozen design: below a 4 px cell a 1x1 block
            // inset by 2 px on each side measures zero, and the Large table's
            // thumbnails would stop showing any planting at all.
            m: `${inset}px`,
            borderRadius: '3px',
            bgcolor: getPlantColor(plantColorKey(i)),
          }}
        />
      ))}
    </Box>
  );
}

export default memo(TemplatePreview);
