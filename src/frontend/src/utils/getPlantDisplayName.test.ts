import { describe, expect, it } from 'vitest';
import type { Plant } from '../types/Plant';
import { getPlantDisplayName } from './getPlantDisplayName';

// Contract locks for the ONE garden-surface name resolver (SMA-194/SMA-155).
// Shapes mirror the two real wire forms: the list DTO's flat `commonName`
// (server-localized) and the detail/raw-entity `translations` array. Seed
// plants are real catalogue rows (Hedera helix carries FR "lierre" and EN
// "english ivy" in PlantTranslations).

const base = { id: 'p1', scientificName: 'Hedera helix' } as Plant;

describe('getPlantDisplayName', () => {
  it('prefers the flat list-DTO commonName, sentence-cased (Library parity)', () => {
    const plant = { ...base, commonName: 'lierre' } as Plant;
    expect(getPlantDisplayName(plant, 'fr')).toBe('Lierre');
  });

  it('resolves the translations array for the requested language when no flat field', () => {
    const plant = {
      ...base,
      translations: [
        { id: 1, language: 'en', commonName: 'english ivy', description: null },
        { id: 2, language: 'fr', commonName: 'lierre', description: null },
      ],
    } as Plant;
    expect(getPlantDisplayName(plant, 'fr')).toBe('Lierre');
    expect(getPlantDisplayName(plant, 'en')).toBe('English ivy');
  });

  it('falls back requested-language → English, never an arbitrary third language', () => {
    // Athyrium vidalii has no FR translation in the catalogue — EN must win.
    // `as unknown as Plant`: the literal's required mutable `translations`
    // fails tsc's direct-cast overlap check against Plant's optional readonly.
    const plant = {
      id: 'p2',
      scientificName: 'Athyrium vidalii',
      translations: [
        { id: 3, language: 'en', commonName: 'lady fern', description: null },
        { id: 4, language: 'es', commonName: 'helecho', description: null },
      ],
    } as unknown as Plant;
    expect(getPlantDisplayName(plant, 'fr')).toBe('Lady fern');
  });

  it('falls back to scientificName when no common name exists in any shape', () => {
    // Bauhinia blakeana-like case: enrichment gap, no translation rows at all.
    const plant = { id: 'p3', scientificName: 'Bauhinia blakeana' } as Plant;
    expect(getPlantDisplayName(plant, 'fr')).toBe('Bauhinia blakeana');
    // Null/empty flat field must not shadow the fallback chain.
    const nullFlat = { ...plant, commonName: null, translations: [] } as Plant;
    expect(getPlantDisplayName(nullFlat, 'en')).toBe('Bauhinia blakeana');
  });
});
