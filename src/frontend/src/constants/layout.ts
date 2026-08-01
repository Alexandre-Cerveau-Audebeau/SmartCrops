export const NAVBAR_HEIGHT = 64;
export const STICKY_OFFSET = NAVBAR_HEIGHT + 16;

/**
 * Width reserved for the auth-dependent second action — the hero's and the
 * About CTA's (SMA-360). Wider than the longest label in either locale
 * ("Créer un compte"), so resolving from unknown to signed-in or signed-out
 * swaps the text without ever moving the action beside it.
 *
 * Shared rather than declared per page (R3): the invariant is global, and two
 * copies drift the day a label grows — leaving exactly one of the two pages
 * reflowing, which is the defect SMA-360 closed.
 */
export const SECOND_ACTION_MIN_WIDTH = 180;
