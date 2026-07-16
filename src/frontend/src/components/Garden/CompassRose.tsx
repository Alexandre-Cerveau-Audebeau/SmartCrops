import { memo } from 'react';
import { getPlannerTokens, type PlannerThemeMode } from '../../theme/plannerTokens';

export interface CompassLabels {
  n: string;
  e: string;
  s: string;
  w: string;
}

interface CompassRoseProps {
  /** Rendered px size — the SVG scales its `0 0 40 40` viewBox to this. */
  size: number;
  mode: PlannerThemeMode;
  /** Dialog variant (§12): a dashed sun-path arc E→S→W in `--expo-icc`. */
  sunArc?: boolean;
  /** Cardinal letters, localized by the caller (W renders 'O' in FR). */
  labels?: CompassLabels;
  /** Accessible name; when omitted the rose is decorative (aria-hidden). */
  ariaLabel?: string;
}

const DEFAULT_LABELS: CompassLabels = { n: 'N', e: 'E', s: 'S', w: 'W' };

/**
 * Shared compass rose (SMA-17, tokens §8). NET-NEW: the planner has no compass
 * yet — the permanent on-grid compass lands in 5.3-D, so nothing consumes this
 * outside the config dialog for now. Geometry is transcribed from §8: viewBox
 * `0 0 40 40`, ring r18 stroke `compRing`, red N needle `polygon 20,7 23.2,20
 * 16.8,20`, grey S tail mirrored. The letter positions and the sun-path arc are
 * derived (not in §8/§12 as coordinates): the arc follows the doc's own note
 * "matin = Est, midi = Sud, soir = Ouest" → a dashed bottom arc E→S→W. Letter
 * colors come from `plannerTokens` (compTx/compMut, resolved by SMA-17 decision).
 */
export const CompassRose = memo(function CompassRose({
  size,
  mode,
  sunArc = false,
  labels = DEFAULT_LABELS,
  ariaLabel,
}: CompassRoseProps) {
  const tk = getPlannerTokens(mode);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <circle
        cx="20"
        cy="20"
        r="18"
        fill="none"
        stroke={tk.compRing}
        strokeWidth="1.4"
      />
      {sunArc && (
        <path
          d="M33 20 A13 13 0 0 1 7 20"
          fill="none"
          stroke={tk.expoIcc}
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeDasharray="1.6 1.8"
        />
      )}
      <polygon points="20,7 23.2,20 16.8,20" fill={tk.compNeedle} />
      <polygon points="20,33 23.2,20 16.8,20" fill={tk.compSTail} />
      <text
        x="20"
        y="4.8"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="6.6"
        fontWeight="800"
        fill={tk.compTx}
      >
        {labels.n}
      </text>
      <text
        x="35.2"
        y="20.8"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="6"
        fontWeight="700"
        fill={tk.compMut}
      >
        {labels.e}
      </text>
      <text
        x="20"
        y="35.4"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="6"
        fontWeight="700"
        fill={tk.compMut}
      >
        {labels.s}
      </text>
      <text
        x="4.8"
        y="20.8"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="6"
        fontWeight="700"
        fill={tk.compMut}
      >
        {labels.w}
      </text>
    </svg>
  );
});
