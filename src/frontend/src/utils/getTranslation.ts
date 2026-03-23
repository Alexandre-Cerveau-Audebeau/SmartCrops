import type { Plant, PlantTranslation } from '../types/Plant';

export function getTranslation(plant: Plant, language = 'en'): PlantTranslation | null {
  return (
    plant.translations.find((t) => t.language === language) ??
    plant.translations[0] ??
    null
  );
}
