/**
 * SMA-336 — the dashboard vocabulary, mirroring the server's
 * `SmartCrops.Core/Dashboard/DashboardLayout.cs` — both checked against
 * `constants/dashboardLayout.reference.json` (PR #287, fix round 1, S2). The
 * three arrays are the single source of truth for what a key, a size and a
 * level may be: the unions below are DERIVED from them, so adding a widget is
 * one edit on this side, not four.
 *
 * The frozen design of 08/09 settled the count at EIGHT widgets (`_spec.md`
 * § 8); the v3 adds a ninth, the Key figures band — `keyfigures` (SMA-437
 * lot 1, PR B, step B1, pre-flight D1), the Expert's alone: which formula has
 * which widget is the server's to say, in the capabilities it serves
 * (SMA-448, lot F1 — `FormulaCapabilities.widgets`). The order
 * here is the canonical one, the band last since it arrived last; where a
 * layout that lacks a widget receives it is its PRESET's place (arbitrage 3 of
 * the lot 1 pre-flight — the server's `Merge`), so the band heads an Expert
 * page saved before it existed.
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
  'keyfigures',
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
 * The level the page stands at until the layout is read — the server's own
 * default, the formula of an account that never chose one. A placeholder, not
 * a capability: what a formula permits comes from the server (SMA-448, S5).
 */
export const DEFAULT_DASHBOARD_LEVEL: DashboardLevel = 'gardener';

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

/**
 * SMA-448, lot F1 — what a formula permits, as the API SERVES it (pre-flight
 * § C.2 a, decided by Alexandre on 26/09): the client draws from this rather
 * than from a copy of its own. The server builds it from the tables it refuses
 * by (`FormulaCatalog`), so what is drawn is what is permitted.
 */
export interface FormulaCapabilities {
  /** The formula these capabilities are the account's. */
  key: DashboardLevel;
  /** How many gardens it allows; null for no limit. Applied from lot F3. */
  gardenLimit: number | null;
  /** The largest garden it allows, in cells. Applied from lot F3. */
  maxGardenSize: { width: number; height: number };
  /** The widgets it has, in its preset's order. */
  widgets: DashboardBlockKey[];
  /** For each of its widgets, the sizes that widget may take, in the order the corner handle steps through them. */
  sizes: Partial<Record<DashboardBlockKey, DashboardSizeList>>;
  /** Its default layout — what « Réinitialiser » returns to, and « · ajustée » compares against. */
  preset: DashboardBlock[];
  /** How it shows the weather — `gardenCards`, `singleCity`, `allCities`; read from lot F4. */
  weather: string;
  /** Whether the page draws the compact action bar (A-9). */
  compactBar: boolean;
}

/** GET /api/dashboard/preferences. */
export interface DashboardPreferences {
  schemaVersion: number;
  /** The account's formula — the server's, never the level a document names. */
  level: DashboardLevel;
  /** True when the server served the level preset instead of a saved layout. */
  isPreset: boolean;
  blocks: DashboardBlock[];
  updatedAt: string | null;
  /** What the formula permits (SMA-448): the ONE source the page draws its widgets, sizes and bar from. */
  capabilities: FormulaCapabilities;
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
