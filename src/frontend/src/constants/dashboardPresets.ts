import type {
  DashboardBlock,
  DashboardBlockKey,
  DashboardLevel,
} from '../types/Dashboard';

/**
 * SMA-336 — the three level presets, transcribed from the frozen design
 * (`_spec.md` § 8) and kept byte-identical to the server's
 * `DashboardPresets.cs`: the client must be able to tell « this layout is the
 * preset » without a round-trip, and « réinitialiser au niveau X » must produce
 * exactly what a fresh account would receive. Checked so since PR #287, fix
 * round 1 (S2): both sides compare their presets to
 * `dashboardLayout.reference.json`.
 *
 * Every preset lists EVERY widget its formula permits — the ones a level does
 * not show are present and `hidden`, so the Customize gallery has something to
 * offer back instead of inventing an entry. And ONLY those (SMA-437 lot 1,
 * PR B, step B1 — pre-flight D4): the blocks of a formula ARE those of its
 * preset, the rule the server refuses a write by and the client and the server
 * drop a stored block by. The Key figures band is the Expert's alone (V3-01),
 * so the Novice and the Gardener list the eight others.
 */
const S = 'small' as const;
const M = 'medium' as const;
const L = 'large' as const;
const W = 'wide' as const;

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

/**
 * Without Statistics since the formulas (SMA-448, lot F1 — R1, V3-01: « Les
 * statistiques — Non · Non · Oui »): the Gardener cannot bring it back from its
 * gallery, and the server refuses it shown. Récolte stays, hidden (Alexandre,
 * 26/09, question 3).
 */
const GARDENER: DashboardBlock[] = [
  { key: 'weather', size: M, hidden: false },
  { key: 'gardens', size: L, hidden: false },
  { key: 'tips', size: M, hidden: false },
  { key: 'month', size: M, hidden: false },
  { key: 'todo', size: M, hidden: false },
  { key: 'counters', size: M, hidden: false },
  { key: 'harvest', size: L, hidden: true },
];

/**
 * Written by hand since the band (pre-flight D8), where it was derived from the
 * keys: « Chiffres clés en tête » (contract § 3.3 [A], § 4.5), in the Full
 * width — its one size — then the eight widgets in Large, as before.
 */
const EXPERT: DashboardBlock[] = [
  { key: 'keyfigures', size: W, hidden: false },
  { key: 'weather', size: L, hidden: false },
  { key: 'gardens', size: L, hidden: false },
  { key: 'tips', size: L, hidden: false },
  { key: 'month', size: L, hidden: false },
  { key: 'todo', size: L, hidden: false },
  { key: 'counters', size: L, hidden: false },
  { key: 'stats', size: L, hidden: false },
  { key: 'harvest', size: L, hidden: false },
];

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
 * Whether `level` has the widget `key` at all — whether its preset lists it
 * (pre-flight D4). The twin of the server's `DashboardPresets.Permits`.
 */
export function permitsBlock(level: DashboardLevel, key: DashboardBlockKey): boolean {
  return PRESETS[level].some((block) => block.key === key);
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
