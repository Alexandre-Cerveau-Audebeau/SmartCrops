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
  /** Dialog variant (§12): a dashed sun arc + sun dot in `--expo-icc`. */
  sunArc?: boolean;
  /** Cardinal letters, localized by the caller (W renders 'O' in FR). */
  labels?: CompassLabels;
  /** Accessible name; when omitted the rose is decorative (aria-hidden). */
  ariaLabel?: string;
  /**
   * The garden's facing (SMA-17 R4, option b): the garden is fixed on screen
   * (top-of-screen = top-of-garden), so the WHOLE rose rotates to bring the
   * chosen direction to the TOP — N→N at top, E→E at top, etc. Null/omitted
   * leaves the rose at rest (N up).
   */
  orientation?: string | null;
}

const DEFAULT_LABELS: CompassLabels = { n: 'N', e: 'E', s: 'S', w: 'W' };

// Rest angles are clockwise from top (N=0, E=90, S=180, W=270); to bring a
// direction to the TOP we rotate the rose by the negative of its rest angle.
const FACING_ROTATION: Record<string, number> = {
  N: 0,
  E: -90,
  S: -180,
  W: -270,
};

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
  orientation,
}: CompassRoseProps) {
  const tk = getPlannerTokens(mode);
  const angle = FACING_ROTATION[orientation ?? ''] ?? 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {/* The ring stays fixed; everything else turns as one group so the chosen
          facing lands at the top (SMA-17 R4, option b). Animated via a CSS
          transition on the transform. */}
      <circle
        cx="20"
        cy="20"
        r="18"
        fill="none"
        stroke={tk.compRing}
        strokeWidth="1.2"
      />
      <g
        transform={`rotate(${angle} 20 20)`}
        style={{ transition: 'transform 250ms ease' }}
      >
        {sunArc && (
          <>
            {/* Dashed sun arc over the top + sun dot at N; the color is the
                mode-aware exposure accent (§8: arc = --expo-icc). */}
            <path
              d="M 6 20 A 14 14 0 0 1 34 20"
              fill="none"
              stroke={tk.expoIcc}
              strokeWidth="1.6"
              strokeDasharray="2.5 2.2"
            />
            <circle cx="20" cy="6" r="2.1" fill={tk.expoIcc} />
          </>
        )}
        <polygon points="20,10 22.6,20 17.4,20" fill={tk.compNeedle} />
        <polygon points="20,30 22.6,20 17.4,20" fill={tk.compSTail} />
        <text
          x="20"
          y="5"
          textAnchor="middle"
          fontSize="5.4"
          fontWeight="800"
          fill={tk.compTx}
        >
          {labels.n}
        </text>
        <text
          x="36.4"
          y="21.8"
          textAnchor="middle"
          fontSize="5.2"
          fontWeight="700"
          fill={tk.compMut}
        >
          {labels.e}
        </text>
        {/* S letter is PRIMARY GREEN in the mockup, not muted. */}
        <text
          x="20"
          y="38.8"
          textAnchor="middle"
          fontSize="5.2"
          fontWeight="800"
          fill={tk.prim}
        >
          {labels.s}
        </text>
        <text
          x="3.6"
          y="21.8"
          textAnchor="middle"
          fontSize="5.2"
          fontWeight="700"
          fill={tk.compMut}
        >
          {labels.w}
        </text>
      </g>
    </svg>
  );
});
