import reference from '../../constants/dashboardLayout.reference.json';
import {
  DASHBOARD_LEVELS,
  isGardenSort,
  isWeatherMode,
  type DashboardBlock,
  type DashboardBlockKey,
  type DashboardLevel,
  type DashboardSizeList,
  type FormulaAccount,
  type FormulaAvailability,
  type FormulaCapabilities,
  type FormulaRefusalReason,
  type FormulasCatalog,
} from '../../types/Dashboard';

/**
 * SMA-448, lot F1, step S5 — the formulas as the API SERVES them, for tests.
 *
 * The client no longer holds a copy of what a formula permits: it draws from
 * the capabilities the server sends with the layout (pre-flight § C.2 a,
 * decided by Alexandre on 26/09). Its old presets and size table survive only
 * here, and not as a copy either — they are READ from
 * `constants/dashboardLayout.reference.json`, the contract the served
 * catalogue is tested against on the server (`FormulasControllerTests`). A
 * test that serves a formula therefore serves what the server serves.
 */

/** A fresh copy of a formula's preset: the caller may mutate it. */
export function presetFor(level: DashboardLevel): DashboardBlock[] {
  return reference.presets[level].map((block) => ({ ...block }) as DashboardBlock);
}

/** The sizes a widget may take at a formula, in the order the corner handle steps through them. */
export function sizesFor(key: DashboardBlockKey, level: DashboardLevel): DashboardSizeList {
  return [...reference.sizesFor[level][key]] as unknown as DashboardSizeList;
}

/** Whether a formula has a widget at all — whether its preset lists it. */
export function permitsBlock(level: DashboardLevel, key: DashboardBlockKey): boolean {
  return reference.presets[level].some((block) => block.key === key);
}

/** A formula's capabilities, exactly as `GET /api/dashboard/preferences` carries them. */
export function capabilitiesFor(level: DashboardLevel): FormulaCapabilities {
  const preset = presetFor(level);
  const widgets = preset.map((block) => block.key);
  const formula = reference.formulas[level];
  // The reference file is the contract of the served catalogue: a weather
  // mode written there that this client does not know is a drift, not a
  // fixture (SMA-448, lot F4).
  if (!isWeatherMode(formula.weather)) throw new Error(`Unknown weather mode ${formula.weather} at ${level}`);
  // The same rule for the sorts of the Gardens widget (SMA-448, lot F5-a).
  const gardenSorts = formula.gardenSorts.map((sort) => {
    if (!isGardenSort(sort)) throw new Error(`Unknown garden sort ${sort} at ${level}`);
    return sort;
  });
  return {
    key: level,
    gardenLimit: formula.gardenLimit,
    maxGardenSize: { ...formula.maxGardenSize },
    widgets,
    sizes: Object.fromEntries(widgets.map((key) => [key, sizesFor(key, level)])),
    preset,
    weather: formula.weather,
    compactBar: formula.compactBar,
    gardenSorts,
  };
}

/**
 * SMA-448, lot F3 — the catalogue as `GET /api/formulas` serves it, for
 * tests: the three formulas (each `capabilitiesFor`), and the account on
 * `current` — chosen, without a garden, every formula available — unless
 * `account` says otherwise. `unavailable` names a formula too small, with
 * the reasons the server would serve; the formula the account is on stays
 * available whatever its reasons (« Votre formule — conservée »).
 */
export function catalogFor(
  current: DashboardLevel,
  account: Partial<Omit<FormulaAccount, 'formula' | 'availability'>> & {
    unavailable?: Partial<Record<DashboardLevel, FormulaRefusalReason[]>>;
  } = {}
): FormulasCatalog {
  const { unavailable = {}, ...rest } = account;
  const availability: FormulaAvailability[] = DASHBOARD_LEVELS.map((level) => {
    const reasons = unavailable[level] ?? [];
    const isCurrent = level === current;
    return { formula: level, current: isCurrent, available: isCurrent || reasons.length === 0, reasons };
  });
  return {
    formulas: DASHBOARD_LEVELS.map((level) => capabilitiesFor(level)),
    account: {
      formula: current,
      chosen: true,
      chosenAt: '2026-09-26T00:00:00Z',
      gardenCount: 0,
      largestGardenSize: null,
      availability,
      ...rest,
    },
  };
}
