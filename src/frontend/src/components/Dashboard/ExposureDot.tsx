import Box from '@mui/material/Box';
import { usePlannerTokens } from '../../theme/usePlannerTokens';
import { useDashboardTokens } from '../../theme/useDashboardTokens';
import type { ExposureCategory } from '../../utils/exposure';

interface Props {
  category: ExposureCategory;
  /** 13px in the table, 12px in a legend (_spec.md 10, point 39). */
  size?: number;
}

/**
 * SMA-336 PR 2/5 — the exposure pastille, on the planner's own palette.
 *
 * Taken from `plannerTokens` verbatim rather than restated: a cell the planner
 * paints « full sun » and a dashboard row that calls it something else would be
 * the same garden disagreeing with itself. Decorative — the label beside it
 * carries the meaning, so the colour is never the only signal.
 *
 * ROUND 5 (A10-9) — a ROUNDED SQUARE, not a circle, and the shade one is
 * hatched. `Main.dc.html` l. 202-206:
 *
 *   .sw-ex { width: 13px; height: 13px; border-radius: 4px; border: 1px solid }
 *   .ex-shade { background: var(--expo-shade); border-color: var(--expo-shade-bd);
 *               background-image: var(--hatch) }
 *
 * The square is what makes the pastille read as a piece of the plan — the
 * planner's own cells are rounded squares, and a circle beside them says « bullet
 * » rather than « cell ». The hatch matters more: shade is the one category the
 * design paints in a cool grey, which is also what an unfilled surface looks
 * like, and the 45° trame is the difference between « shaded » and « nothing
 * measured ». It is also the one of the four signals that survives greyscale.
 *
 * ONE component for THREE render sites — the Gardens table's EXPOSITION cell,
 * the Statistics legend, and the dominant swatch of a per-garden Statistics row
 * — so the mark cannot be a square in one place and a circle in another.
 */
export default function ExposureDot({ category, size = 13 }: Props) {
  const tk = usePlannerTokens();
  const dash = useDashboardTokens();
  const swatch = tk.expo[category];

  return (
    <Box
      aria-hidden
      data-exposure-dot={category}
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '4px',
        backgroundColor: swatch.fill,
        border: `1px solid ${swatch.border}`,
        ...(category === 'shade'
          ? { backgroundImage: dash.exposureHatch }
          : null),
      }}
    />
  );
}
