import { memo } from 'react';
import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';
import { usePlannerTokens } from '../../theme/usePlannerTokens';
import { templateGrid, type GardenTemplate } from '../../utils/gardenTemplates';
import { getPlantColor } from '../../utils/plantColor';

interface Props {
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
}

/** The §15 soil hue shown as a wash over the cell — the pastille hue at the
 * trame's own day opacity, so a soil reads at 16 px without its pattern. */
const SOIL_WASH_OPACITY = 0.38;

/** Preview gap between cells, in px (the §4 gap scaled to the thumbnail). */
const PREVIEW_GAP_PX = 1;

/**
 * SMA-18 lot 2: a template's thumbnail — rows × cols rectangles coloured from
 * the planner tokens (cell on/off, §6 infrastructure fills, §15 soil hues) with
 * one rectangle per placement on top (the placement's own plant colour). Pure
 * and DECORATIVE: `aria-hidden`, no roles, no pointer events — the card that
 * hosts it carries the accessible name. Deliberately NOT GardenGrid: that
 * component is interactive (role="grid", one gridcell per cell, axis rails,
 * 14–18 px icons, 7 px pastilles) and unreadable below ~30 px per cell.
 */
function TemplatePreview({ template, resolvePlantId, cellPx = 16 }: Props) {
  const tk = usePlannerTokens();
  const grid = templateGrid(template);

  return (
    <Box
      aria-hidden
      data-testid="template-preview"
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${template.cols}, ${cellPx}px)`,
        gridTemplateRows: `repeat(${template.rows}, ${cellPx}px)`,
        gap: `${PREVIEW_GAP_PX}px`,
        p: `${PREVIEW_GAP_PX}px`,
        bgcolor: tk.cellOnBd,
        borderRadius: '6px',
        width: 'fit-content',
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
              : tk.cellOn;
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
            m: '2px',
            borderRadius: '3px',
            bgcolor: getPlantColor(
              resolvePlantId?.(placement.scientificName) ??
                placement.scientificName
            ),
          }}
        />
      ))}
    </Box>
  );
}

export default memo(TemplatePreview);
