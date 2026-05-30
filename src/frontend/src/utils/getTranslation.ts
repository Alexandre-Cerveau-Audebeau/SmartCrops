import type { Plant, PlantTranslation } from '../types/Plant';

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
