import { describe, expect, it } from 'vitest';
import i18n from '../i18n/i18n';
import { formatPeriod } from './formatPeriod';

// Use the real i18n resources (en.json / fr.json) via getFixedT so the test
// exercises the actual translations, not a hand-rolled mock.
const tEn = i18n.getFixedT('en');
const tFr = i18n.getFixedT('fr');

describe('formatPeriod', () => {
  it('localises a month range (EN)', () => {
    expect(formatPeriod('february-may', tEn)).toBe('February – May');
  });

  it('localises a month range (FR)', () => {
    expect(formatPeriod('february-may', tFr)).toBe('de février à mai');
  });

  it('localises year-round', () => {
    expect(formatPeriod('year-round', tEn)).toBe('Year-round');
    expect(formatPeriod('year-round', tFr)).toBe("Toute l'année");
  });

  it('localises a single month', () => {
    expect(formatPeriod('june', tEn)).toBe('June');
    expect(formatPeriod('june', tFr)).toBe('juin');
  });

  it('is case/whitespace tolerant', () => {
    expect(formatPeriod('  February-May  ', tFr)).toBe('de février à mai');
  });

  it('returns the raw value for an unparsable / free-form period', () => {
    // Season words are not month tokens — the ETL stores these on perenualData
    // (harvestSeason/floweringSeason); the helper must not show a raw i18n key.
    expect(formatPeriod('spring', tFr)).toBe('spring');
    expect(formatPeriod('early summer', tFr)).toBe('early summer');
    // A range with an unknown month falls back verbatim.
    expect(formatPeriod('march-sometime', tFr)).toBe('march-sometime');
  });

  it('returns null for null/blank', () => {
    expect(formatPeriod(null, tFr)).toBeNull();
    expect(formatPeriod(undefined, tFr)).toBeNull();
    expect(formatPeriod('   ', tFr)).toBeNull();
  });
});
