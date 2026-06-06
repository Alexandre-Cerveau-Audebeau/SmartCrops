import type { Plant, PlantTranslation } from '../types/Plant';

/**
 * SMA-120: resolve a single translated field independently (requested language →
 * English → null). Per-field resolution prevents an FR row that carries only a name
 * from masking the EN description (and vice-versa) — the same per-field contract the
 * list DTO mapper applies server-side.
 */
export function resolveTranslatedField(
  plant: Plant,
  language: string,
  field: 'commonName' | 'description',
): string | null {
  const requested = plant.translations?.find((tr) => tr.language === language);
  const english = plant.translations?.find((tr) => tr.language === 'en');
  return requested?.[field] ?? english?.[field] ?? null;
}

export function getTranslation(plant: Plant, language = 'en'): PlantTranslation | null {
  // The neutral list DTO (PlantListItemResponse, PR #100) ships no
  // `translations`, so `plant.translations` can be undefined at runtime. Guard
  // every access so a missing array degrades to null instead of throwing during
  // render — an unguarded `.find` here previously blanked the Library (SMA-73).
  return (
    plant.translations?.find((t) => t.language === language) ??
    plant.translations?.[0] ??
    null
  );
}
