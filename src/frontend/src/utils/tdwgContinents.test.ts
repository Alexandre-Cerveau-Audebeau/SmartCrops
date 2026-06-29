import { describe, expect, it } from 'vitest';
import {
  CONTINENT_ORDER,
  TDWG_TO_CONTINENT,
  regionsToContinents,
  type Continent,
} from './tdwgContinents';

describe('TDWG_TO_CONTINENT table', () => {
  it('has exactly 360 entries', () => {
    expect(Object.keys(TDWG_TO_CONTINENT)).toHaveLength(360);
  });

  it('maps every token to a known continent', () => {
    const allowed = new Set<Continent>(CONTINENT_ORDER);
    for (const c of Object.values(TDWG_TO_CONTINENT)) {
      expect(allowed.has(c)).toBe(true);
    }
  });
});

describe('regionsToContinents', () => {
  it('maps representative tokens', () => {
    expect(regionsToContinents(['Peru'])).toEqual(['southAmerica']);
    expect(regionsToContinents(['Alabama', 'France', 'Japan'])).toEqual([
      'northAmerica',
      'asia',
      'europe',
    ]);
  });

  it('returns [] for empty input or unknown tokens', () => {
    expect(regionsToContinents([])).toEqual([]);
    expect(regionsToContinents(['Atlantis'])).toEqual([]);
  });

  it('returns DISTINCT continents in CONTINENT_ORDER', () => {
    // One token from each bucket → all 7, ordered by CONTINENT_ORDER.
    const oneEach = [
      'Kenya', // africa
      'Alabama', // northAmerica
      'Cuba', // centralAmericaCaribbean
      'Peru', // southAmerica
      'Japan', // asia
      'France', // europe
      'Fiji', // oceania
    ];
    expect(regionsToContinents(oneEach)).toEqual(CONTINENT_ORDER);
    // Duplicates collapse.
    expect(regionsToContinents(['Peru', 'Bolivia', 'Chile North'])).toEqual([
      'southAmerica',
    ]);
  });

  // Boundary conventions — lock the tricky assignments.
  it.each([
    ['Azores', 'europe'],
    ['Madeira', 'europe'],
    ['Canary Is.', 'africa'],
    ['Cape Verde', 'africa'],
    ['Cyprus', 'asia'],
    ['Turkey', 'asia'],
    ['Sinai', 'asia'],
    ['Mexico Central', 'northAmerica'],
    ['Greenland', 'northAmerica'],
    ['Bahamas', 'centralAmericaCaribbean'],
    ['Venezuelan Antilles', 'centralAmericaCaribbean'],
    ['Venezuela', 'southAmerica'],
    ['Falkland Is.', 'southAmerica'],
    ['Kerguelen', 'oceania'],
    ['Hawaii', 'oceania'],
    ['Svalbard', 'europe'],
    ['Tristan da Cunha', 'africa'],
  ])('classifies %s as %s', (token, continent) => {
    expect(regionsToContinents([token])[0]).toBe(continent);
  });
});
