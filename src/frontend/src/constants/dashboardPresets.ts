import {
  DASHBOARD_BLOCK_KEYS,
  type DashboardBlock,
  type DashboardLevel,
} from '../types/Dashboard';

/**
 * SMA-336 — the three level presets, transcribed from the frozen design
 * (`_spec.md` § 8) and kept byte-identical to the server's
 * `DashboardPresets.cs`: the client must be able to tell « this layout is the
 * preset » without a round-trip, and « réinitialiser au niveau X » must produce
 * exactly what a fresh account would receive.
 *
 * Every preset lists ALL eight widgets — the ones a level does not show are
 * present and `hidden`, so the Customize gallery has something to offer back
 * instead of inventing an entry.
 */
const S = 'small' as const;
const M = 'medium' as const;
const L = 'large' as const;

const NOVICE: DashboardBlock[] = [
  { key: 'weather', size: M, hidden: false },
  { key: 'gardens', size: M, hidden: false },
  { key: 'tips', size: S, hidden: false },
  { key: 'month', size: S, hidden: false },
  { key: 'todo', size: M, hidden: true },
  { key: 'counters', size: M, hidden: true },
  { key: 'stats', size: L, hidden: true },
  { key: 'harvest', size: L, hidden: true },
];

const GARDENER: DashboardBlock[] = [
  { key: 'weather', size: M, hidden: false },
  { key: 'gardens', size: L, hidden: false },
  { key: 'tips', size: M, hidden: false },
  { key: 'month', size: M, hidden: false },
  { key: 'todo', size: M, hidden: false },
  { key: 'counters', size: M, hidden: false },
  { key: 'stats', size: L, hidden: true },
  { key: 'harvest', size: L, hidden: true },
];

const EXPERT: DashboardBlock[] = DASHBOARD_BLOCK_KEYS.map((key) => ({
  key,
  size: L,
  hidden: false,
}));

export const DEFAULT_DASHBOARD_LEVEL: DashboardLevel = 'gardener';

const PRESETS: Record<DashboardLevel, DashboardBlock[]> = {
  novice: NOVICE,
  gardener: GARDENER,
  expert: EXPERT,
};

/**
 * A FRESH copy of a level's preset — the caller mutates its result (drag,
 * resize, hide) and must never reach the module-level arrays.
 */
export function presetFor(level: DashboardLevel): DashboardBlock[] {
  return PRESETS[level].map((block) => ({ ...block }));
}

/**
 * True when the layout no longer matches its level's preset — the « · ajustée »
 * suffix of the level chip. Compared on the three things the user can change in
 * the Edit mode: ORDER (index by index), size and visibility. `options` is
 * deliberately out: PR 1/5 writes none, and a future widget option must not
 * silently relabel a layout the user never rearranged.
 */
export function isAdjusted(
  blocks: DashboardBlock[],
  level: DashboardLevel
): boolean {
  const preset = PRESETS[level];
  if (blocks.length !== preset.length) return true;
  return blocks.some(
    (block, index) =>
      block.key !== preset[index]!.key ||
      block.size !== preset[index]!.size ||
      block.hidden !== preset[index]!.hidden
  );
}
