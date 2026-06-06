import { describe, expect, it } from 'vitest';
import { getTranslation, resolveTranslatedField } from './getTranslation';
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

describe('resolveTranslatedField (SMA-120 per-field)', () => {
  // FR row carries only a name; EN row carries the description.
  const frNameEnDesc: PlantTranslation[] = [
    { id: 1, language: 'en', commonName: 'Basil', description: 'Sweet basil.' },
    { id: 2, language: 'fr', commonName: 'Basilic', description: null },
  ];

  it('resolves each field independently: FR name + EN description', () => {
    expect(resolveTranslatedField(plantWith(frNameEnDesc), 'fr', 'commonName')).toBe('Basilic');
    expect(resolveTranslatedField(plantWith(frNameEnDesc), 'fr', 'description')).toBe('Sweet basil.');
  });

  it('falls back to English per field when the requested language is absent', () => {
    expect(resolveTranslatedField(plantWith(frNameEnDesc), 'es', 'commonName')).toBe('Basil');
    expect(resolveTranslatedField(plantWith(frNameEnDesc), 'es', 'description')).toBe('Sweet basil.');
  });

  it('returns null (no arbitrary third-language fallback) and never throws on undefined', () => {
    const deOnly: PlantTranslation[] = [{ id: 3, language: 'de', commonName: 'Basilikum', description: 'x' }];
    expect(resolveTranslatedField(plantWith(deOnly), 'fr', 'commonName')).toBeNull();
    expect(() => resolveTranslatedField(plantWith(undefined), 'en', 'description')).not.toThrow();
    expect(resolveTranslatedField(plantWith(undefined), 'en', 'description')).toBeNull();
  });
});
