import type { Plant } from '../types/Plant';
import { capitalizeFirst } from './capitalizeFirst';
import { resolveTranslatedField } from './getTranslation';

/**
 * SMA-194 / SMA-155 — the ONE display-name resolver for every garden surface,
 * with the exact Library semantics post-SMA-120:
 *
 * 1. flat `commonName` (list DTO, already localized server-side per `?lang=`) —
 *    what PlantCard renders: `capitalizeFirst(plant.commonName) ?? scientificName`;
 * 2. else the `translations` array resolved requested-language → English —
 *    what PlantDetail renders via `resolveTranslatedField` (detail DTO shape);
 * 3. else the language-neutral `scientificName` (already capitalised).
 *
 * Accepting BOTH wire shapes is the point: garden surfaces are fed by the list
 * DTO (planner catalog, gardens cards) or by raw-entity plants with
 * `translations` (garden detail) — every one of them must show the same name
 * the Library shows for the same plant.
 */
export function getPlantDisplayName(plant: Plant, language: string): string {
  return (
    capitalizeFirst(plant.commonName) ??
    capitalizeFirst(resolveTranslatedField(plant, language, 'commonName')) ??
    plant.scientificName
  );
}
