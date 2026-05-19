import type { Plant, PlantCommonName, PlantImage, PlantLongDescription } from '../types/Plant';

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
 * Hero image fallback chain validated in Phase 1: prefer a `Main` image
 * (Perenual's `default_image` lands here), then `Habit`, then `Flower`, then
 * the first image of any other type, then the legacy `Plant.imageUrl` column,
 * finally the brand placeholder.
 */
export function pickHeroImage(plant: Plant): string {
  if (plant.images?.length) {
    const byType = (type: string) => plant.images.find((i) => i.imageType === type);
    return (
      byType('Main')?.url ??
      byType('Habit')?.url ??
      byType('Flower')?.url ??
      plant.images[0].url
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
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
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
  max: number | null | undefined,
): boolean {
  if (min == null || max == null) return false;
  if (min === 2 && max === 2) return true;
  if (min > max) return true;
  return false;
}

export function formatHardinessZone(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    return min === max ? `${min}` : `${min}-${max}`;
  }
  return min != null ? `${min}+` : `≤${max}`;
}

export function formatRange(
  min: number | null | undefined,
  max: number | null | undefined,
  unit: string,
): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    return min === max ? `${min} ${unit}` : `${min}–${max} ${unit}`;
  }
  return min != null ? `≥${min} ${unit}` : `≤${max} ${unit}`;
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
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
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
  language: string,
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
  uiLanguage: string,
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
      if (a.isPrimary !== b.isPrimary) return Number(b.isPrimary) - Number(a.isPrimary);
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
