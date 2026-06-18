import { describe, expect, it } from 'vitest';
import i18n from '../i18n/i18n';
import { formatPeriod, periodToMonths } from './formatPeriod';

// Use the real i18n resources (en.json / fr.json) via getFixedT so the test
// exercises the actual translations, not a hand-rolled mock.
const tEn = i18n.getFixedT('en');
const tFr = i18n.getFixedT('fr');

describe('formatPeriod', () => {
  it('localises a month range (EN)', () => {
    expect(formatPeriod('february-may', tEn)).toBe('February – May');
  });

  it('localises a month range (FR)', () => {
    expect(formatPeriod('february-may', tFr)).toBe('Février – Mai');
  });

  it('localises year-round', () => {
    expect(formatPeriod('year-round', tEn)).toBe('Year-round');
    expect(formatPeriod('year-round', tFr)).toBe("Toute l'année");
  });

  it('localises a single month', () => {
    expect(formatPeriod('june', tEn)).toBe('June');
    expect(formatPeriod('june', tFr)).toBe('Juin');
  });

  it('is case/whitespace tolerant', () => {
    expect(formatPeriod('  February-May  ', tFr)).toBe('Février – Mai');
  });

  it('localises season words (Perenual flowering/harvest season)', () => {
    expect(formatPeriod('spring', tEn)).toBe('Spring');
    expect(formatPeriod('spring', tFr)).toBe('Printemps');
    // fall and autumn both map to "Automne" in FR (intentional).
    expect(formatPeriod('fall', tEn)).toBe('Fall');
    expect(formatPeriod('fall', tFr)).toBe('Automne');
    expect(formatPeriod('autumn', tFr)).toBe('Automne');
  });

  it('returns the raw value for an unparsable / free-form period', () => {
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

describe('periodToMonths (SMA-78 — 12-month timeline)', () => {
  it('maps a month range to inclusive 1-based indices', () => {
    expect(periodToMonths('march-may')).toEqual([3, 4, 5]);
  });

  it('wraps a year-end range past December', () => {
    expect(periodToMonths('november-february')).toEqual([11, 12, 1, 2]);
  });

  it('maps a single month', () => {
    expect(periodToMonths('june')).toEqual([6]);
  });

  it('maps season words (fall == autumn)', () => {
    expect(periodToMonths('spring')).toEqual([3, 4, 5]);
    expect(periodToMonths('summer')).toEqual([6, 7, 8]);
    expect(periodToMonths('fall')).toEqual([9, 10, 11]);
    expect(periodToMonths('autumn')).toEqual([9, 10, 11]);
    expect(periodToMonths('winter')).toEqual([12, 1, 2]);
  });

  it('maps year-round to all twelve months', () => {
    expect(periodToMonths('year-round')).toHaveLength(12);
  });

  it('is case/whitespace tolerant', () => {
    expect(periodToMonths('  Spring ')).toEqual([3, 4, 5]);
  });

  it('returns [] for null/blank/unknown', () => {
    expect(periodToMonths(null)).toEqual([]);
    expect(periodToMonths(undefined)).toEqual([]);
    expect(periodToMonths('   ')).toEqual([]);
    expect(periodToMonths('early summer')).toEqual([]);
    expect(periodToMonths('march-sometime')).toEqual([]);
  });
});
