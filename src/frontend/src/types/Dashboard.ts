/**
 * SMA-336 — the dashboard vocabulary, mirroring the server's
 * `SmartCrops.Core/Dashboard/DashboardLayout.cs`. The three arrays are the
 * single source of truth for what a key, a size and a level may be: the unions
 * below are DERIVED from them, so adding a widget is one edit, not four.
 *
 * The frozen design settles the count at EIGHT widgets (`_spec.md` § 8, « les
 * huit widgets en Grand », and exactly eight `data-widget` keys on the
 * artboards). The order here is the canonical one — it is also the order the
 * server appends a missing block in, so a layout saved before a widget existed
 * grows predictably.
 */
export const DASHBOARD_BLOCK_KEYS = [
  'weather',
  'gardens',
  'tips',
  'month',
  'todo',
  'counters',
  'stats',
  'harvest',
] as const;

export type DashboardBlockKey = (typeof DASHBOARD_BLOCK_KEYS)[number];

/** Footprints, in grid cells: 1×1, 2×1, 2×2 (`_spec.md` § 1). */
export const DASHBOARD_SIZES = ['small', 'medium', 'large'] as const;

export type DashboardSize = (typeof DASHBOARD_SIZES)[number];

export const DASHBOARD_LEVELS = ['novice', 'gardener', 'expert'] as const;

export type DashboardLevel = (typeof DASHBOARD_LEVELS)[number];

/**
 * The one widget the grid never lets go: hiding it would leave the page with
 * no path to a garden or to the planner. The server refuses to store
 * `hidden: true` on it and ignores it on read (DashboardController.Merge).
 */
export const NON_HIDABLE_BLOCK: DashboardBlockKey = 'gardens';

/**
 * One widget in the layout. Position is the INDEX in
 * {@link DashboardPreferences.blocks}, never a stored number — moving a widget
 * renumbers nothing.
 */
export interface DashboardBlock {
  key: DashboardBlockKey;
  size: DashboardSize;
  hidden: boolean;
  /** Per-widget settings; the server round-trips them, PR 1/5 writes none. */
  options?: Record<string, unknown> | null;
}

/** GET /api/dashboard/preferences. */
export interface DashboardPreferences {
  schemaVersion: number;
  level: DashboardLevel;
  /** True when the server served the level preset instead of a saved layout. */
  isPreset: boolean;
  blocks: DashboardBlock[];
  updatedAt: string | null;
}

/** PUT /api/dashboard/preferences — the layout is replaced wholesale. */
export interface SaveDashboardPreferences {
  level: DashboardLevel;
  blocks: DashboardBlock[];
}

export function isDashboardBlockKey(value: string): value is DashboardBlockKey {
  return (DASHBOARD_BLOCK_KEYS as readonly string[]).includes(value);
}

export function isDashboardLevel(value: string): value is DashboardLevel {
  return (DASHBOARD_LEVELS as readonly string[]).includes(value);
}

/**
 * The Edit-mode corner handle cycles Small -> Medium -> Large -> Small. It
 * WRAPS on purpose: without the wrap a widget grown to Large could never be
 * brought back down, since the handle is the only resize gesture.
 */
export function nextDashboardSize(size: DashboardSize): DashboardSize {
  const index = DASHBOARD_SIZES.indexOf(size);
  return DASHBOARD_SIZES[(index + 1) % DASHBOARD_SIZES.length]!;
}
