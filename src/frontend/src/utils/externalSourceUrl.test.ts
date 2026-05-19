import { describe, expect, it } from 'vitest';
import { isUserFacingUrl, toUserFacingUrl } from './externalSourceUrl';

describe('toUserFacingUrl', () => {
  it('rewrites GBIF api endpoints to the public species page', () => {
    expect(toUserFacingUrl('https://api.gbif.org/v1/species/2930137')).toBe(
      'https://www.gbif.org/species/2930137',
    );
  });

  it('rewrites Perenual api endpoints to the plant-species-database-search-finder page', () => {
    expect(toUserFacingUrl('https://perenual.com/api/v2/species/details/8758')).toBe(
      'https://perenual.com/plant-species-database-search-finder/species/8758',
    );
  });

  it('returns null for null input', () => {
    expect(toUserFacingUrl(null)).toBeNull();
    expect(toUserFacingUrl(undefined)).toBeNull();
  });

  it('passes through unknown patterns unchanged', () => {
    expect(toUserFacingUrl('https://example.com/unknown')).toBe('https://example.com/unknown');
  });

  it('accepts http and uppercase variants of the GBIF pattern', () => {
    expect(toUserFacingUrl('http://API.GBIF.ORG/v1/species/12345')).toBe(
      'https://www.gbif.org/species/12345',
    );
  });

  it('accepts different Perenual API versions', () => {
    expect(toUserFacingUrl('https://perenual.com/api/v1/species/details/42')).toBe(
      'https://perenual.com/plant-species-database-search-finder/species/42',
    );
  });
});

describe('isUserFacingUrl', () => {
  it('is true for the rewritten public URLs', () => {
    expect(isUserFacingUrl('https://www.gbif.org/species/2930137')).toBe(true);
    expect(
      isUserFacingUrl('https://perenual.com/plant-species-database-search-finder/species/8758'),
    ).toBe(true);
  });

  it('is false for Trefle-style endpoints we have no public rewrite for', () => {
    expect(isUserFacingUrl('https://trefle.io/api/v1/species/123')).toBe(false);
  });

  it('is false for null/undefined', () => {
    expect(isUserFacingUrl(null)).toBe(false);
    expect(isUserFacingUrl(undefined)).toBe(false);
  });
});
