import type {
  DashboardBlock,
  DashboardBlockKey,
  DashboardSizeList,
  FormulaCapabilities,
} from '../types/Dashboard';

/**
 * SMA-448, lot F1, step S5 — what a formula permits, READ from the
 * capabilities the API serves with the layout (pre-flight § C.2 a, decided by
 * Alexandre on 26/09). This module used to hold the client's own copy of the
 * size table and of the presets, twins of the server's kept equal by a shared
 * reference file (PR #287, S2); the server is now the one source, and the
 * twins survive only as test fixtures read from that file
 * (`src/test/fixtures/formulas.ts`). R8 — a right is checked on the server —
 * becomes the rule of display too: the page draws what it is told is
 * permitted.
 */

/**
 * The sizes `key` may take at the formula, in the order the corner handle
 * steps through them; null for a widget the formula does not have — which the
 * page never renders (`permitsBlock`, and `dashboardApi.normalize`).
 */
export function sizesFor(
  key: DashboardBlockKey,
  capabilities: FormulaCapabilities
): DashboardSizeList | null {
  return capabilities.sizes[key] ?? null;
}

/** Whether the formula has the widget `key` at all. */
export function permitsBlock(capabilities: FormulaCapabilities, key: DashboardBlockKey): boolean {
  return capabilities.widgets.includes(key);
}

/**
 * A FRESH copy of the formula's preset — the caller mutates its result (drag,
 * resize, hide) and must never reach the capabilities it was served.
 */
export function presetOf(capabilities: FormulaCapabilities): DashboardBlock[] {
  return capabilities.preset.map((block) => ({ ...block }));
}

/**
 * True when the layout no longer matches its formula's preset — the
 * « · ajustée » suffix of the level chip. Compared on the three things the
 * user can change in the Edit mode: ORDER (index by index), size and
 * visibility. `options` is deliberately out (V19): setting a widget — its
 * figures, its sort, its count — never relabels a layout the user never
 * rearranged.
 */
export function isAdjusted(blocks: DashboardBlock[], capabilities: FormulaCapabilities): boolean {
  const preset = capabilities.preset;
  if (blocks.length !== preset.length) return true;
  return blocks.some(
    (block, index) =>
      block.key !== preset[index]!.key ||
      block.size !== preset[index]!.size ||
      block.hidden !== preset[index]!.hidden
  );
}

/**
 * SMA-437, lot V39, PR B, step B3 — whether the page draws the compact action
 * bar (A-9, Alexandre 25/09): none at the Novice formula, one at the Gardener
 * and the Expert formulas — as the formula's capabilities say.
 */
export function hasActionBar(capabilities: FormulaCapabilities): boolean {
  return capabilities.compactBar;
}

/**
 * SMA-448, lot F2 (SMA-436) — whether the formula's page is ONE CARD PER
 * GARDEN rather than a grid of widgets: the Novice page (contract v3 § 3.1
 * « Page d'accueil », § 4.3), decided by Alexandre on 22/09 (14:53). Read
 * from the served capabilities, as every right is (R8): the formula's weather
 * mode `gardenCards` — « no widget: the weather of each garden's own city, on
 * its card » (`FormulaCatalog.WeatherModes`) — is the one that names the
 * page; the formulas with a widget grid show their weather in the Weather
 * widget (`singleCity`, `allCities`).
 */
export function isCardsPage(capabilities: FormulaCapabilities): boolean {
  return capabilities.weather === 'gardenCards';
}

/**
 * SMA-448, lot F4 — whether the Weather widget walks EVERY city of the
 * account — a navigator in Small and Medium, tabs in Large, every city at
 * once in the Full width — or shows ONE city, fixed (V3-02; contract v3
 * § 3.2, [A] 22/09 18:52). The served weather mode says it (`allCities`);
 * the Gardener's `singleCity` and the Novice's `gardenCards` both answer no.
 * A difference of interface, not of right (R8's one written exception): the
 * aggregate serves every place to every formula.
 */
export function showsEveryCity(capabilities: FormulaCapabilities): boolean {
  return capabilities.weather === 'allCities';
}
