import type {
  Plant,
  PlantCommonName,
  PlantImage,
  PlantLongDescription,
  PlantPerenualData,
} from '../types/Plant';
import type { UnitSystem } from '../contexts/unitSystemContextValue';

/**
 * Gallery priority (matches `PlantDetailMapper.ImageTypePriority` server-side).
 * Anything not listed (or arriving as an unexpected string) sorts to the end.
 */
const IMAGE_TYPE_PRIORITY: Record<string, number> = {
  Main: 0,
  Habit: 1,
  Flower: 2,
  Leaf: 3,
  Fruit: 4,
  Bark: 5,
  Other: 6,
};

/**
 * Inline SVG used when a plant has zero images and no legacy `imageUrl`.
 * Encoded as a data URI so it ships without an asset round-trip; the green
 * matches the brand palette.
 */
export const PLANT_HERO_PLACEHOLDER =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="%234CAF78"/><text x="50%25" y="50%25" font-family="Georgia,serif" font-size="220" font-weight="700" fill="white" text-anchor="middle" dominant-baseline="central">S</text></svg>';

/**
 * Hero image selection (SMA-118). Perenual `Main` images are time-limited signed
 * S3 URLs that expire (~24h) and now 403, so they are NO LONGER preferred:
 * prefer a STABLE-source image (Trefle/PlantNet) by cover-type priority
 * (`Habit` → `Flower` → `Leaf` → first stable). If the plant has no stable image,
 * fall back to the legacy `Plant.imageUrl` scalar, then the brand placeholder —
 * skipping the dead Perenual rows rather than rendering a broken image.
 */
export function pickHeroImage(plant: Plant): string {
  const stable = (plant.images ?? []).filter(
    (i) => i.source === 'Trefle' || i.source === 'PlantNet'
  );
  if (stable.length) {
    const byType = (type: string) =>
      stable.find((i) => i.imageType === type)?.url;
    return (
      byType('Habit') ?? byType('Flower') ?? byType('Leaf') ?? stable[0].url
    );
  }
  return plant.imageUrl ?? PLANT_HERO_PLACEHOLDER;
}

/**
 * Stable gallery order: type priority, then `displayOrder`, then `id` as the
 * final tiebreaker. Returns a new array — callers can spread/slice freely.
 */
export function sortGalleryImages(images: readonly PlantImage[]): PlantImage[] {
  return [...images].sort((a, b) => {
    const pa = IMAGE_TYPE_PRIORITY[a.imageType] ?? 99;
    const pb = IMAGE_TYPE_PRIORITY[b.imageType] ?? 99;
    if (pa !== pb) return pa - pb;
    if (a.displayOrder !== b.displayOrder)
      return a.displayOrder - b.displayOrder;
    return a.id - b.id;
  });
}

/**
 * True when the gallery carries at least two distinct `ImageType` values —
 * the cue for whether per-image type labels are worth rendering. Pre-Trefle
 * tomato (5 × Perenual `Main`/`Other`) returns true on this technicality even
 * though the labels are noisy; tighten if it bothers users.
 */
export function hasDistinctImageTypes(images: readonly PlantImage[]): boolean {
  if (!images?.length) return false;
  const types = new Set(images.map((i) => i.imageType));
  return types.size > 1;
}

/**
 * Hardiness data we don't trust. Two patterns observed:
 * - <c>min == max == 2</c>: the documented ETL bug surfaced on the tomato seed —
 *   USDA zone 2 is wildly cold-hardy for Solanum lycopersicum.
 * - <c>min &gt; max</c>: a flipped pair, never legitimate.
 *
 * Returning true switches the caller to a warning chip with a tooltip — better
 * than hiding the data outright since the user still benefits from seeing
 * "something is weird here" rather than a silent omission.
 */
export function isHardinessSuspicious(
  min: number | null | undefined,
  max: number | null | undefined
): boolean {
  if (min == null || max == null) return false;
  if (min === 2 && max === 2) return true;
  if (min > max) return true;
  return false;
}

/**
 * Format a USDA hardiness zone range for display. Returns `null` when both
 * bounds are absent (caller hides the row). Collapses `min === max` to a
 * single number and falls back to a half-open form (`5+`, `≤10`) when only
 * one side is known.
 */
export function formatHardinessZone(
  min: number | null | undefined,
  max: number | null | undefined
): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    return min === max ? `${min}` : `${min}-${max}`;
  }
  return min != null ? `${min}+` : `≤${max}`;
}

// ── Unit conversion (SMA-178) ─────────────────────────────────────────────
// Pure conversions; the system is always passed in as a parameter (never read
// from a context here), so these stay testable and side-effect-free. Display
// rounds to the nearest integer — see formatLength / formatTemperature.

export const cmToInches = (cm: number): number => cm / 2.54;
export const inchesToCm = (inch: number): number => inch * 2.54;
export const celsiusToFahrenheit = (c: number): number => (c * 9) / 5 + 32;

/**
 * Assemble a min/max range with a trailing unit in the shared display
 * convention: `min–max unit` (en-dash), `min unit` when the bounds collapse,
 * half-open `≥min unit` / `≤max unit`, and `null` when both bounds are absent.
 * `display` maps each raw numeric bound to the number actually shown (identity
 * for metric, the rounded conversion for imperial).
 */
function assembleRange(
  min: number | null | undefined,
  max: number | null | undefined,
  unit: string,
  display: (n: number) => number
): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    const lo = display(min);
    const hi = display(max);
    return lo === hi ? `${lo} ${unit}` : `${lo}–${hi} ${unit}`;
  }
  return min != null ? `≥${display(min)} ${unit}` : `≤${display(max!)} ${unit}`;
}

/**
 * Format a length range stored in centimetres for the chosen system. Metric
 * shows the raw cm value (`30–120 cm`); imperial converts to whole inches
 * (`12–47 in`). Half-open / equal-bound / null-bound handling matches
 * {@link assembleRange}. US lengths are simple inches by product decision
 * (no feet+inches).
 */
export function formatLength(
  minCm: number | null | undefined,
  maxCm: number | null | undefined,
  system: UnitSystem
): string | null {
  if (system === 'imperial') {
    return assembleRange(minCm, maxCm, 'in', (n) => Math.round(cmToInches(n)));
  }
  return assembleRange(minCm, maxCm, 'cm', (n) => n);
}

/**
 * Format a temperature range stored in Celsius for the chosen system. Metric
 * `18–24 °C`; imperial converts to whole Fahrenheit `64–75 °F`.
 */
export function formatTemperature(
  minC: number | null | undefined,
  maxC: number | null | undefined,
  system: UnitSystem
): string | null {
  if (system === 'imperial') {
    return assembleRange(minC, maxC, '°F', (n) =>
      Math.round(celsiusToFahrenheit(n))
    );
  }
  return assembleRange(minC, maxC, '°C', (n) => n);
}

/**
 * Tolerant parser for the JSON-array string columns (e.g. `edibleParts`).
 * Returns an empty array on any malformed input rather than throwing — these
 * columns are populated by ETL and could in theory ship an unexpected shape.
 */
export function parseStringArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * Pick the best long description for the current UI locale.
 * Priority: exact language → English → first available.
 */
export function pickLongDescription(
  longDescriptions: readonly PlantLongDescription[],
  language: string
): PlantLongDescription | null {
  if (!longDescriptions?.length) return null;
  const exact = longDescriptions.find((d) => d.language === language);
  if (exact) return exact;
  const en = longDescriptions.find((d) => d.language === 'en');
  if (en) return en;
  return longDescriptions[0];
}

/**
 * Group common names by language code, primary names first within each group.
 * Returns a Map preserving insertion order (sorted by primary-language first,
 * then alphabetically by language code).
 */
export function groupCommonNamesByLanguage(
  commonNames: Plant['commonNames'],
  uiLanguage: string
): Map<string, Plant['commonNames']> {
  const grouped = new Map<string, Plant['commonNames']>();
  for (const cn of commonNames) {
    const existing = grouped.get(cn.languageCode);
    if (existing) {
      // Cast required when callers pass `readonly` arrays — the grouped Map
      // stores the mutable working copy we just built, so the push is safe.
      (existing as PlantCommonName[]).push(cn);
    } else {
      grouped.set(cn.languageCode, [cn]);
    }
  }
  // Within each language group, primary names come first (the function
  // contract); ties break alphabetically so the order is deterministic.
  for (const [, names] of grouped) {
    (names as PlantCommonName[]).sort((a, b) => {
      if (a.isPrimary !== b.isPrimary)
        return Number(b.isPrimary) - Number(a.isPrimary);
      return a.name.localeCompare(b.name);
    });
  }
  // Across languages: UI language first, then alphabetical.
  const entries = [...grouped.entries()].sort(([a], [b]) => {
    if (a === uiLanguage) return -1;
    if (b === uiLanguage) return 1;
    return a.localeCompare(b);
  });
  return new Map(entries);
}

// ── Perenual Supreme xData (Section F.6, Sprint 1.5 PR B) ──────────────────

/**
 * Format a numeric xData range with a decorative suffix, for the NON-convertible
 * Section F.6 / hero quantities only (sun hours, watering pH). Convertible
 * measures use the unit-aware {@link formatLength} / {@link formatTemperature}
 * instead. Uses a trailing `+` for half-open ranges (Perenual ships `max=""`
 * frequently) and an en-dash (U+2013) separator.
 *
 * - `formatXDataRange(6, 8, ' h')` → `'6–8 h'`
 * - `formatXDataRange(6, null, ' h')` → `'6+ h'` (half-open)
 * - `formatXDataRange(null, 30)` → `'≤30'` (defensive, rare)
 * - `formatXDataRange(6, 6)` → `'6'` (equal bounds collapse)
 * - `formatXDataRange(null, null)` → `null` (caller hides the row)
 */
export function formatXDataRange(
  min: number | null,
  max: number | null,
  suffix = ''
): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max === null) return `${min}+${suffix}`;
  if (min === null && max !== null) return `≤${max}${suffix}`;
  if (min === max) return `${min}${suffix}`;
  return `${min}–${max}${suffix}`;
}

/**
 * Parse a JSON-array string column (e.g. `xWateringQualityJson`) into a
 * `string[]`. Returns `null` on null/empty/malformed input or an empty/non-array
 * payload, so the caller can skip rendering the row entirely.
 */
export function parseStringArrayJson(json: string | null): string[] | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const strings = parsed.filter(
      (item): item is string => typeof item === 'string'
    );
    return strings.length === 0 ? null : strings;
  } catch {
    return null;
  }
}

/**
 * True when a spacing value is renderable — BOTH the value and a source unit
 * must be present (a bare number has no meaningful display). Unit-agnostic, so
 * the Section F.6 presence gate ({@link hasAnyXData}) never depends on the UI
 * unit system.
 */
export function hasSpacing(value: number | null, unit: string | null): boolean {
  return value !== null && !!unit?.trim();
}

/** Parse the Perenual source spacing unit to centimetres; null if unrecognized. */
function spacingToCm(value: number, sourceUnit: string): number | null {
  const u = sourceUnit.trim().toLowerCase();
  if (u.startsWith('inch') || u === 'in') return inchesToCm(value);
  if (u.startsWith('cm') || u.startsWith('centim')) return value;
  return null;
}

/**
 * Compose a plant-spacing display value (SMA-178). The source unit is whatever
 * Perenual stored (`XPlantSpacingUnit`, observed as `"inches"`; `"cm"` handled
 * defensively): it is parsed to centimetres, then shown in the chosen system —
 * `46 cm` (metric) or `18 in` (imperial), rounded to a whole number. Returns
 * `null` when value/unit are absent; an unrecognized source unit falls back to
 * the raw `value unit` verbatim rather than guessing a conversion.
 */
export function formatSpacing(
  value: number | null,
  sourceUnit: string | null,
  system: UnitSystem
): string | null {
  const trimmedUnit = sourceUnit?.trim();
  if (value === null || !trimmedUnit) return null;
  const cm = spacingToCm(value, trimmedUnit);
  if (cm === null) return `${value} ${trimmedUnit}`;
  return system === 'imperial'
    ? `${Math.round(cmToInches(cm))} in`
    : `${Math.round(cm)} cm`;
}

/**
 * True when at least one Perenual Supreme xData field carries a value — the cue
 * for whether Section F.6 is worth rendering at all (an empty section is worse
 * than no section).
 */
export function hasAnyXData(pd: PlantPerenualData): boolean {
  return (
    pd.xWateringBasedTempMinC !== null ||
    pd.xWateringBasedTempMaxC !== null ||
    pd.xWateringPhMin !== null ||
    pd.xWateringPhMax !== null ||
    pd.xSunlightHoursMin !== null ||
    pd.xSunlightHoursMax !== null ||
    pd.xTemperatureToleranceMinC !== null ||
    pd.xTemperatureToleranceMaxC !== null ||
    // Spacing needs BOTH value + unit to render a row (mirror hasSpacing),
    // else the gate would pass with no renderable spacing row (CR #76 r1).
    hasSpacing(pd.xPlantSpacingValue, pd.xPlantSpacingUnit) ||
    parseStringArrayJson(pd.xWateringQualityJson) !== null ||
    parseStringArrayJson(pd.xWateringPeriodJson) !== null
  );
}

/**
 * Single source of truth for section-07 culture facts: splits/trims/filters
 * the raw Perenual fields into ready-to-render lists (raw values, NOT
 * translated). Both {@link hasCultureContent} (section gating) and
 * CultureSection (rendering) derive from this, so the "what rows exist" rule
 * lives in exactly one place (SMA-231).
 */
export interface CultureFacts {
  propagationMethods: string[];
  pruningMonths: string[];
  wateringBenchmark: string | null;
}

export function getCultureFacts(pd: PlantPerenualData | null): CultureFacts {
  const split = (s: string | null | undefined) =>
    s
      ?.split(',')
      .map((v) => v.trim())
      .filter(Boolean) ?? [];
  return {
    propagationMethods: split(pd?.propagationMethods),
    pruningMonths: split(pd?.pruningMonths),
    wateringBenchmark: pd?.wateringBenchmark?.trim() || null,
  };
}

/**
 * True when the plant has at least one displayable culture fact (propagation
 * method, pruning month, or watering benchmark). Derives from
 * {@link getCultureFacts} so section 07 is never mounted — nor marked "live" in
 * the TOC — with zero visible rows (SMA-231).
 */
export function hasCultureContent(pd: PlantPerenualData | null): boolean {
  const f = getCultureFacts(pd);
  return (
    f.propagationMethods.length > 0 ||
    f.pruningMonths.length > 0 ||
    !!f.wateringBenchmark
  );
}

/**
 * Map a raw Perenual label (e.g. `"Reverse Osmosis Water"`, `"Pond/Lake Water"`)
 * to its camelCase i18n key (`reverseOsmosisWater`, `pondLakeWater`). Whitespace
 * and slashes are stripped; the first character is lower-cased. Callers pass the
 * raw label as the i18n fallback so unknown values still render.
 */
export function toCamelKey(label: string): string {
  return label.replace(/[\s/]+/g, '').replace(/^./, (c) => c.toLowerCase());
}
