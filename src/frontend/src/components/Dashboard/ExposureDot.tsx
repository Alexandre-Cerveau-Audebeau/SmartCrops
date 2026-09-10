import Box from '@mui/material/Box';
import { usePlannerTokens } from '../../theme/usePlannerTokens';
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
 */
export default function ExposureDot({ category, size = 13 }: Props) {
  const tk = usePlannerTokens();
  const swatch = tk.expo[category];

  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        backgroundColor: swatch.fill,
        border: `1px solid ${swatch.border}`,
      }}
    />
  );
}
