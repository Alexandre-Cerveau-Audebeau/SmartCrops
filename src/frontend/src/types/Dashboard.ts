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

/**
 * Footprints, in grid cells: 1×1, 2×1, 2×2 (`_spec.md` § 1), and the fourth
 * size of the v3, the Full width — « Pleine largeur » on screen, `wide` here,
 * never « Large », which is Grand (SMA-437, V8): 4×1, as tall as its content.
 */
export const DASHBOARD_SIZES = ['small', 'medium', 'large', 'wide'] as const;

export type DashboardSize = (typeof DASHBOARD_SIZES)[number];

/** The sizes a widget may take at a formula — never empty (`sizesFor`, SMA-437). */
export type DashboardSizeList = readonly [DashboardSize, ...DashboardSize[]];

export const DASHBOARD_LEVELS = ['novice', 'gardener', 'expert'] as const;

export type DashboardLevel = (typeof DASHBOARD_LEVELS)[number];

/**
 * The one widget the grid never lets go: hiding it would leave the page with
 * no path to a garden or to the planner. The server refuses to store
 * `hidden: true` on it and ignores it on read (DashboardController.Merge).
 */
export const NON_HIDABLE_BLOCK = 'gardens' satisfies DashboardBlockKey;

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

/**
 * What a Customize-gallery thumbnail can honestly show of a hidden widget
 * (round 4, A8) — a formatted headline `value` and, optionally, a few
 * occupancy `bars` as percentages. Supplied by the page, which is the only
 * place that holds the figures; a widget the aggregate cannot feed yet answers
 * `null` and the panel says « soon » instead (rule 4 of the design contract).
 *
 * Here beside `DashboardBlock` and not in `CustomizePanel.tsx` (round 6,
 * Extension #4-4): it is a data contract the page and the panel both read, and
 * neither should import the other's module for a shape.
 */
export interface GalleryPreview {
  value: string;
  bars?: number[];
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

export function isDashboardSize(value: string): value is DashboardSize {
  return (DASHBOARD_SIZES as readonly string[]).includes(value);
}

/**
 * The Edit-mode corner handle steps through `sizes` — the sizes the widget may
 * take at its formula (`sizesFor`, SMA-437 A-N11), in their order: Small ->
 * Medium -> Large -> Small, and -> Full width before Small the day an Expert
 * widget has it. It WRAPS on purpose: without the wrap a widget grown to its
 * largest size could never be brought back down, since the handle is the only
 * resize gesture. A size the list does not hold steps to the first one; a
 * one-size list has no handle at all (`SortableWidget`).
 */
export function nextDashboardSize(size: DashboardSize, sizes: DashboardSizeList): DashboardSize {
  const index = sizes.indexOf(size);
  return sizes[(index + 1) % sizes.length] ?? sizes[0];
}
