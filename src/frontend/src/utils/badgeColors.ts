import { alpha, lighten } from '@mui/material/styles';
import type { ColorMode } from '../contexts/colorModeContextValue';

export interface BadgeColors {
  bg: string;
  fg: string;
  border?: string;
}

/**
 * Adapt a light-tuned {bg, fg(, border)} badge palette to the active mode
 * (SMA-184). Light is returned unchanged; dark is DERIVED from the badge's
 * own hue (its fg) so we never hand-pick dark hexes: a subtle tinted fill,
 * a lightened readable foreground, and a mid-alpha border. Works for the
 * green/red/blue/amber/… feature, toxicity, pest and source families.
 */
export function adaptBadge(
  c: BadgeColors,
  mode: ColorMode
): { bg: string; fg: string; border: string } {
  if (mode === 'light') {
    return { bg: c.bg, fg: c.fg, border: c.border ?? c.bg };
  }
  // Dark derivation tuned for the navy canvas (`background.default` #0D1E34),
  // all keyed off the badge's own hue (`fg`) so a new family needs no dark hex:
  // - bg  = fg @ 0.18 alpha → a faint tinted fill that reads on navy
  // - fg  = lighten(fg, 0.6) → a light, legible foreground on that fill
  // - border = fg @ 0.4 alpha → a mid-strength edge that defines the badge
  // (Contrast was validated by eye; a WCAG check is tracked as tech-debt.)
  return {
    bg: alpha(c.fg, 0.18),
    fg: lighten(c.fg, 0.6),
    border: alpha(c.fg, 0.4),
  };
}
