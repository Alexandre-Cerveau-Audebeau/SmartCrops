/**
 * Soils (SMA-14) — PURE helpers, no React, no I/O; the structural mirror of
 * ./infrastructure.ts. Storage stays PER-CELL (`CellData.soil`, painted like
 * infrastructure); nothing region-shaped is derived here — a soil expresses
 * itself per cell (trame under the plants + corner pastille above them), so
 * there is no grouping. No table, no migration, no backend change.
 *
 * THE STORED KEYS ARE ENGLISH, deliberately, for two reasons:
 * 1. Infrastructure already stores English keys with i18n labels ('wall',
 *    'fence', 'path') — French stored values would be an arbitrary asymmetry
 *    inside the same CellsJson blob.
 * 2. More important: the plant data's soil vocabulary is English (Perenual
 *    cache word-tokens — loam/loamy 650, sand/sandy 745, clay 446,
 *    rocky+gravelly 813, humus+rich+enriched 831, bog 76), so English keys
 *    make the future recommendation matching a DIRECT token comparison
 *    instead of a translated one — that is what keeps SMA-21 cheap.
 *
 * The key → data-token mapping lives in SOIL_META.matches. Two keys carry an
 * empty mapping in full knowledge: 'chalk' has NO texture match — Perenual
 * encodes it as the CHEMISTRY word 'alkaline', so its future matching goes
 * through pH (SoilPhMin/SoilPhMax), not texture; 'potting' has none by
 * construction — a manufactured substrate Perenual never names, legitimate
 * because balcony/terrace garden types are all potting mix.
 */

/** The 8 types (SMA-14 vocabulary ruling, 30 Jul 2026 — decided by the plant
 * data). Order = the sidebar SOLS list order. */
export const SOIL_TYPES = [
  'potting',
  'loam',
  'sand',
  'clay',
  'stony',
  'chalk',
  'humus',
  'wet',
] as const;

/** One of the 8 stored soil keys — the English, data-aligned vocabulary
 * (see the module docstring for why the keys are not French). */
export type SoilType = (typeof SOIL_TYPES)[number];

/**
 * Runtime guard at the JSON boundary (same contract as isInfrastructureType /
 * isExposureCategory): persisted CellsJson may carry anything — an unknown
 * value must be dropped, never enter CellData as a fake SoilType (it would
 * also crash the §15 trame lookup at render).
 */
export function isSoilType(value: unknown): value is SoilType {
  return (SOIL_TYPES as readonly unknown[]).includes(value);
}

/**
 * One soil's metadata. The sidebar row and the render consume only the key
 * itself (label via `planner.soil.types.<key>`, trame/pastille via
 * `tk.soil[<key>]`), so this record carries exactly one field: the Perenual
 * word-tokens the type will match when SMA-21 compares a painted soil
 * against a plant's soil string. Empty = no texture match (module docstring:
 * chalk → pH, potting → nothing by construction).
 */
export interface SoilMeta {
  matches: readonly string[];
}

export const SOIL_META: Record<SoilType, SoilMeta> = {
  potting: { matches: [] },
  loam: { matches: ['loam', 'loamy'] },
  sand: { matches: ['sand', 'sandy'] },
  clay: { matches: ['clay'] },
  stony: { matches: ['rocky', 'gravelly'] },
  chalk: { matches: [] },
  humus: { matches: ['humus', 'rich', 'enriched'] },
  wet: { matches: ['bog'] },
};
