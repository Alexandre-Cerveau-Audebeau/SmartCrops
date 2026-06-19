import { alpha, lighten } from '@mui/material/styles';

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
  mode: 'light' | 'dark'
): { bg: string; fg: string; border: string } {
  if (mode === 'light') {
    return { bg: c.bg, fg: c.fg, border: c.border ?? c.bg };
  }
  return {
    bg: alpha(c.fg, 0.18),
    fg: lighten(c.fg, 0.6),
    border: alpha(c.fg, 0.4),
  };
}
