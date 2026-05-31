import { describe, expect, it } from 'vitest';
import { getTranslation } from './getTranslation';
import type { Plant, PlantTranslation } from '../types/Plant';

const translations: PlantTranslation[] = [
  { id: 1, language: 'en', commonName: 'Basil', description: 'Sweet basil.' },
  { id: 2, language: 'fr', commonName: 'Basilic', description: 'Basilic.' },
];

// Only `translations` is exercised here; the rest of the Plant contract is
// irrelevant to this helper, so cast a minimal object.
function plantWith(value: readonly PlantTranslation[] | undefined): Plant {
  return { translations: value } as unknown as Plant;
}

describe('getTranslation', () => {
  it('returns the translation matching the requested language', () => {
    expect(getTranslation(plantWith(translations), 'fr')?.commonName).toBe('Basilic');
  });

  it('falls back to the first translation when the requested language is absent', () => {
    expect(getTranslation(plantWith(translations), 'es')?.commonName).toBe('Basil');
  });

  it('returns null without throwing when translations is undefined (neutral list DTO — SMA-73)', () => {
    // Since PR #100, GET /api/plants ships PlantListItemResponse, which carries
    // no `translations`. At runtime `plant.translations` is therefore undefined;
    // before the guard this threw "Cannot read properties of undefined (reading
    // 'find')" during render and blanked the whole Library page.
    expect(() => getTranslation(plantWith(undefined), 'en')).not.toThrow();
    expect(getTranslation(plantWith(undefined), 'en')).toBeNull();
  });

  it('returns null without throwing when translations is empty (pre-#100 behaviour)', () => {
    expect(getTranslation(plantWith([]), 'en')).toBeNull();
  });
});
