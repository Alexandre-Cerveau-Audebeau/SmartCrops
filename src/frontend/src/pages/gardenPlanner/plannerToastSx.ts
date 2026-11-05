import type { Theme } from '@mui/material/styles';

// SMA-477 — the sx of the planner's one toast, out of the page: a pure
// function whose form a unit test guards. No React, no state.

/**
 * The `sx` of the planner's toast — a `Snackbar` anchored bottom-centre: the
 * lift above the unsaved-changes bar while the plan is modified (R5), one
 * tier under the modal while the M9 confirmation is open (E9, SMA-457).
 * Neither met, the object is empty: the toast keeps MUI's own place and tier.
 */
export function plannerToastSx(args: {
  dirtyBarHeight: number;
  isDirty: boolean;
  underVeil: boolean;
  theme: Theme;
}) {
  const { dirtyBarHeight, isDirty, underVeil, theme } = args;
  const lifted = `${dirtyBarHeight + 32}px`;
  return {
    // R5 lifts the toast above the unsaved-changes bar. MUI's own root rule
    // re-sets `bottom` under @media (min-width:600px) and emotion serializes
    // it AFTER the plain declaration, so the lift is written again under the
    // same breakpoint (SMA-477, form B): the plain declaration stays (jsdom
    // and the R5 test read it), the media rule wins in a browser at `sm`+.
    ...(isDirty && {
      bottom: lifted,
      [theme.breakpoints.up('sm')]: { bottom: lifted },
    }),
    ...(underVeil && { zIndex: theme.zIndex.modal - 1 }),
  };
}
