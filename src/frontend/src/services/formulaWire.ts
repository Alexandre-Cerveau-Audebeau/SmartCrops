import {
  isDashboardBlockKey,
  isDashboardLevel,
  isDashboardSize,
  isWeatherMode,
  type DashboardBlock,
  type DashboardBlockKey,
  type DashboardLevel,
  type DashboardSizeList,
  type FormulaCapabilities,
  type FormulaRefusalReason,
  type GardensRefusalReason,
  type SizeRefusalReason,
} from '../types/Dashboard';
import { isBoolean, isString, isWholeNumber, matches } from './wireChecks';

/**
 * SMA-448, lot F3 — the checks of what a formula serves, shared by the
 * layout's read (`dashboardApi`) and the catalogue's (`formulasApi`): the
 * capabilities of a formula, and the reasons one is too small. A module of
 * their own, with no fetch and no side effect, so a suite that mocks
 * `dashboardApi` whole (the dashboard's suites do) never finds the
 * catalogue's module reaching into the mock for them.
 */

/** A size list the grid can step through: non-empty, every entry a known size. */
function isSizeList(value: unknown): value is DashboardSizeList {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((size) => typeof size === 'string' && isDashboardSize(size))
  );
}

/**
 * SMA-448, lot F1, S5 — the capabilities the server serves with the layout,
 * checked before they are trusted, as every record at this boundary is. They
 * are what the page draws its widgets, their sizes and its bar from, so
 * capabilities that do not hold together are refused WHOLE — the page shows
 * its actionable error rather than guess: an unknown formula, a widget this
 * build does not know, a widget without a size list, a preset block of a
 * widget the formula does not have, or a preset that misses one it has.
 * Exported for the catalogue (`formulasApi`, SMA-448 lot F3), which reads
 * each of its three formulas through the same check.
 */
export function normalizeCapabilities(raw: unknown): FormulaCapabilities {
  function fail(reason: string): never {
    throw new Error(`Invalid formula capabilities: ${reason}`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) fail('not an object');
  const source = raw as Record<string, unknown>;

  const key = source.key;
  if (typeof key !== 'string' || !isDashboardLevel(key)) fail('unknown formula');

  const widgetsRaw = source.widgets;
  if (!Array.isArray(widgetsRaw)) fail('no widgets');
  const widgets = (widgetsRaw as unknown[]).map((widget) =>
    typeof widget === 'string' && isDashboardBlockKey(widget) ? widget : fail(`unknown widget ${String(widget)}`)
  );

  const sizesRaw = source.sizes;
  if (typeof sizesRaw !== 'object' || sizesRaw === null || Array.isArray(sizesRaw)) fail('no sizes');
  const sizes: Partial<Record<DashboardBlockKey, DashboardSizeList>> = {};
  for (const widget of widgets) {
    const list = (sizesRaw as Record<string, unknown>)[widget];
    if (!isSizeList(list)) fail(`no sizes for ${widget}`);
    sizes[widget] = [...(list as DashboardSizeList)] as unknown as DashboardSizeList;
  }

  const presetRaw = source.preset;
  if (!Array.isArray(presetRaw)) fail('no preset');
  const preset = (presetRaw as unknown[]).map((entry) => {
    const block = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    if (typeof block.key !== 'string' || !isDashboardBlockKey(block.key) || !widgets.includes(block.key)) {
      return fail(`a preset block of a widget the formula does not have`);
    }
    if (typeof block.size !== 'string' || !isDashboardSize(block.size)) return fail(`a preset size`);
    if (typeof block.hidden !== 'boolean') return fail(`a preset visibility`);
    return { key: block.key, size: block.size, hidden: block.hidden } satisfies DashboardBlock;
  });
  if (preset.length !== widgets.length) fail('a preset that is not the formula\'s widgets');

  const maxRaw = source.maxGardenSize as Record<string, unknown> | null | undefined;
  if (
    typeof maxRaw !== 'object' ||
    maxRaw === null ||
    !isWholeNumber(maxRaw.width) ||
    !isWholeNumber(maxRaw.height)
  ) {
    fail('no largest garden size');
  }
  const gardenLimit = source.gardenLimit;
  if (gardenLimit !== null && !isWholeNumber(gardenLimit)) fail('a garden limit');
  // SMA-448, lot F4 — the weather mode is a capability the page DRAWS by
  // (one city or every city): a mode this build does not know is refused
  // whole, like an unknown widget, never guessed at.
  if (!isString(source.weather) || !isWeatherMode(source.weather)) fail('unknown weather mode');
  if (!isBoolean(source.compactBar)) fail('no compact bar');

  return {
    key: key as DashboardLevel,
    gardenLimit: gardenLimit as number | null,
    maxGardenSize: {
      width: (maxRaw as { width: number }).width,
      height: (maxRaw as { height: number }).height,
    },
    widgets,
    sizes,
    preset,
    weather: source.weather,
    compactBar: source.compactBar as boolean,
  };
}

// ── The refusal of a formula ─────────────────────────────────────────────

const isGardensReason = matches<GardensRefusalReason>({
  kind: (value): value is 'gardens' => value === 'gardens',
  have: isWholeNumber,
  limit: isWholeNumber,
});

const isSizeReason = matches<SizeRefusalReason>({
  kind: (value): value is 'size' => value === 'size',
  gardenId: isString,
  width: isWholeNumber,
  height: isWholeNumber,
  maxWidth: isWholeNumber,
  maxHeight: isWholeNumber,
});

export const isRefusalReason = (value: unknown): value is FormulaRefusalReason =>
  isGardensReason(value) || isSizeReason(value);
