import type { Plant } from '../types/Plant';

/**
 * SMA-120: resolve a single translated field independently (requested language →
 * English → null). Per-field resolution prevents an FR row that carries only a name
 * from masking the EN description (and vice-versa) — the same per-field contract the
 * list DTO mapper applies server-side.
 */
// Blank ('' / whitespace-only) values are real wire data (enrichment gaps) and
// must not short-circuit the fallback chain: `??` only falls through nullish,
// so a blank requested translation used to mask a valid English one (SMA-288).
const nonBlank = (value: string | null | undefined): string | null =>
  value && value.trim() ? value : null;

export function resolveTranslatedField(
  plant: Plant,
  language: string,
  field: 'commonName' | 'description',
): string | null {
  const requested = plant.translations?.find((tr) => tr.language === language);
  const english = plant.translations?.find((tr) => tr.language === 'en');
  return nonBlank(requested?.[field]) ?? nonBlank(english?.[field]) ?? null;
}

// getTranslation (requested-language → translations[0] → null) was DELETED
// with SMA-194: every garden surface now goes through getPlantDisplayName,
// and its `translations[0]` tier could surface an arbitrary non-requested
// language — divergent from the SMA-120 per-field contract above.
