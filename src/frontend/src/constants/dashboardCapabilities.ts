import type {
  DashboardBlockKey,
  DashboardLevel,
  DashboardSizeList,
} from '../types/Dashboard';

/**
 * SMA-437 lot 1, PR A, step A2 (pre-flight D3) — the sizes a widget may take,
 * per formula. The twin of the server's `DashboardCapabilities.SizesFor`, row
 * for row: the server refuses a size outside this table on write and brings
 * it back to the preset's on read, and the client does the same on read
 * (`dashboardApi.normalize`). Pinned literally on both sides, as the presets
 * are — and both sides are checked against ONE file,
 * `dashboardLayout.reference.json` (PR #287, fix round 1, S2): a row changed
 * here and not there, or not in the file, fails a suite.
 *
 * The rule it carries (A-N11, 23/09): the Full width is an Expert capability,
 * and a widget gets it only once its Full-width version is DRAWN — until then
 * the size would show its Large stretched over 1 152 px. So the table follows
 * what is drawn, not only what is permitted: Jardins, Météo, Statistiques,
 * Compteurs and Ce mois-ci will each add `wide` to their Expert row in their
 * own lot, on both sides; the Key figures band arrives with `wide` as its one
 * size. In this PR no widget has it.
 */

/** Small, Medium, Large — in the order the corner handle steps through them. */
const THREE_SIZES = ['small', 'medium', 'large'] as const satisfies DashboardSizeList;

/**
 * The Expert's row, widget by widget: the one formula the Full width is ever
 * offered to. A row here, not a rule, so the day a widget is drawn in Full
 * width is a one-line change that a review sees.
 */
const EXPERT_SIZES: Record<DashboardBlockKey, DashboardSizeList> = {
  weather: THREE_SIZES,
  gardens: THREE_SIZES,
  tips: THREE_SIZES,
  month: THREE_SIZES,
  todo: THREE_SIZES,
  counters: THREE_SIZES,
  stats: THREE_SIZES,
  harvest: THREE_SIZES,
};

/**
 * The sizes `key` may take at `level`, in the order the corner handle steps
 * through them. The Gardener never gets the Full width (A-N11: « Petit → Moyen
 * → Grand → Petit »); the Novice keeps the three sizes of today's grid.
 */
export function sizesFor(key: DashboardBlockKey, level: DashboardLevel): DashboardSizeList {
  return level === 'expert' ? EXPERT_SIZES[key] : THREE_SIZES;
}
