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
 * SMA-448, lot F4 — how a formula shows the weather, as `FormulaCatalog.
 * WeatherModes` serves it (V3-02, decided by Alexandre on 22/09 18:52 and its
 * complement): `gardenCards` — no widget, the weather of each garden's own
 * city on its card (the Novice page, lot F2); `singleCity` — the Weather
 * widget for ONE city, fixed, never a tab nor a navigator (the Gardener);
 * `allCities` — every city, one at a time up to Large, all together in the
 * Full width (the Expert). The vocabulary the wire is parsed with; the
 * reference file (`dashboardLayout.reference.json`) is checked against it.
 */
export const WEATHER_MODES = ['gardenCards', 'singleCity', 'allCities'] as const;

export type WeatherMode = (typeof WEATHER_MODES)[number];

/**
 * SMA-448, lot F5-a — the sorts of the Gardens widget (V3-04; A-N3, decided
 * by Alexandre on 28/09), in the gear panel's order: the most recently OPENED
 * first (the default — a garden never opened ranks by its last modification),
 * A to Z, the most recently CREATED first, the most recently MODIFIED first,
 * and the order the user set by hand — the Expert's alone. The vocabulary the
 * wire is parsed with; which of them a formula offers is what the server
 * serves (`FormulaCapabilities.gardenSorts`) and refuses by (R8).
 */
export const GARDEN_SORTS = ['lastOpened', 'name', 'created', 'updated', 'custom'] as const;

export type GardenSort = (typeof GARDEN_SORTS)[number];

/** The default sort of every formula that has the widget (decision of 23/09). */
export const DEFAULT_GARDEN_SORT: GardenSort = 'lastOpened';

/** How many gardens the widget shows — 5 · 8 · 10 — beside « Tous » (A-N4: the cap, in Large as in the Full width). */
export const GARDENS_COUNTS = [5, 8, 10] as const;

/** « Tous »: every garden, no cap. */
export const GARDENS_COUNT_ALL = 'all';

export type GardensCount = (typeof GARDENS_COUNTS)[number] | typeof GARDENS_COUNT_ALL;

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
  /** How it shows the weather (lot F4): the cards page, one fixed city, or every city — see {@link WEATHER_MODES}. */
  weather: WeatherMode;
  /** Whether the page draws the compact action bar (A-9). */
  compactBar: boolean;
  /**
   * The sorts its Gardens widget offers, in the gear panel's order (lot F5-a,
   * A-N3): none for the Novice, three for the Gardener, the five of
   * {@link GARDEN_SORTS} for the Expert. The panel draws these and no other.
   */
  gardenSorts: GardenSort[];
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
  /**
   * SMA-448, lot F3 — whether the account has ever CHOSEN its formula: false
   * until its first deliberate choice, and the cue the choice screen is shown
   * once on (N18). Read with the layout, in the server's one statement.
   */
  formulaChosen: boolean;
}

/**
 * SMA-448, PR #293, fix round 2 (A1) — why the server refused a formula, as
 * `PUT /api/formulas/current` serves it in its 409 `formula.tooSmall` problem:
 * too many gardens for the formula, or a garden larger than it allows, one
 * reason per garden. The numbers are the message's.
 */
export interface GardensRefusalReason {
  kind: 'gardens';
  /** How many gardens the account has. */
  have: number;
  /** How many the formula allows. */
  limit: number;
}

export interface SizeRefusalReason {
  kind: 'size';
  gardenId: string;
  width: number;
  height: number;
  maxWidth: number;
  maxHeight: number;
}

export type FormulaRefusalReason = GardensRefusalReason | SizeRefusalReason;

/**
 * SMA-448, lot F3, step L4 (R3-E1) — how a switch of formula did not go
 * through: `refused`, the server refused the formula with its reasons (409
 * `formula.tooSmall`); `unauthorized`, the session expired (401); `forbidden`,
 * a right the account lacks (403); `failed`, a failure a retry may cure —
 * no server, a timeout, a 5xx, a refusal the server did not explain.
 */
export type FormulaRefusalKind = 'refused' | 'unauthorized' | 'forbidden' | 'failed';

/** A switch of formula that did not go through: how, the formula asked for, and the reasons served — none but for a refusal. */
export interface FormulaRefusal {
  kind: FormulaRefusalKind;
  formula: DashboardLevel;
  reasons: FormulaRefusalReason[];
}

/**
 * SMA-448, lot F3 — whether the caller may choose a formula, as
 * `GET /api/formulas` serves it: the one it is on is always available, even
 * beyond its limits (« Votre formule — conservée »); its reasons are still
 * listed, for the screen to say.
 */
export interface FormulaAvailability {
  formula: DashboardLevel;
  current: boolean;
  available: boolean;
  reasons: FormulaRefusalReason[];
}

/** SMA-448, lot F3 — the caller against the catalogue. */
export interface FormulaAccount {
  /** The account's formula. */
  formula: DashboardLevel;
  /** Whether the account has ever CHOSEN it — false until its first deliberate choice. */
  chosen: boolean;
  /** When, UTC; null until then. */
  chosenAt: string | null;
  /** How many gardens the account has. */
  gardenCount: number;
  /** The widest width and the tallest height among its gardens with a plan — possibly two gardens; null when none has a plan. */
  largestGardenSize: { width: number; height: number } | null;
  /** Each formula, in the catalogue's order. */
  availability: FormulaAvailability[];
}

/** `GET /api/formulas`: the three formulas, and the caller against them. */
export interface FormulasCatalog {
  /** In the catalogue's order — Novice, Gardener, Expert. */
  formulas: FormulaCapabilities[];
  account: FormulaAccount;
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

export function isWeatherMode(value: string): value is WeatherMode {
  return (WEATHER_MODES as readonly string[]).includes(value);
}

export function isGardenSort(value: string): value is GardenSort {
  return (GARDEN_SORTS as readonly string[]).includes(value);
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
