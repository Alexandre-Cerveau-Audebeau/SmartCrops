import reference from '../../constants/dashboardLayout.reference.json';
import type {
  DashboardBlock,
  DashboardBlockKey,
  DashboardLevel,
  DashboardSizeList,
  FormulaCapabilities,
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
  return {
    key: level,
    gardenLimit: formula.gardenLimit,
    maxGardenSize: { ...formula.maxGardenSize },
    widgets,
    sizes: Object.fromEntries(widgets.map((key) => [key, sizesFor(key, level)])),
    preset,
    weather: formula.weather,
    compactBar: formula.compactBar,
  };
}
