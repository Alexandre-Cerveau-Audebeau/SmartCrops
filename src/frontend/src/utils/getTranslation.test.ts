import { describe, expect, it } from 'vitest';
import { resolveTranslatedField } from './getTranslation';
import type { Plant, PlantTranslation } from '../types/Plant';

// `getTranslation` (first-match → translations[0] → null) was deleted with
// SMA-194: its last consumers were the garden surfaces, all migrated to
// getPlantDisplayName; its arbitrary-first-translation fallback diverged from
// the SMA-120 server contract that resolveTranslatedField mirrors.

// Only `translations` is exercised here; the rest of the Plant contract is
// irrelevant to this helper, so cast a minimal object.
function plantWith(value: readonly PlantTranslation[] | undefined): Plant {
  return { translations: value } as unknown as Plant;
}

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
