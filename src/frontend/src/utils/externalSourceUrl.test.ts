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

  it('prefers an explicit Perenual id over the one embedded in the API URL', () => {
    // Tomato canonicalisation case (issue #67): persisted URL points to the
    // canonical id 8758 (the wrong Solanum dulcamara entry), but the
    // requested id was 8759 — the user-facing link must use 8759.
    expect(
      toUserFacingUrl('https://perenual.com/api/v2/species/details/8758', 8759),
    ).toBe('https://perenual.com/plant-species-database-search-finder/species/8759');
  });

  it('falls back to the URL-embedded id when no explicit id is provided', () => {
    expect(
      toUserFacingUrl('https://perenual.com/api/v2/species/details/8758', null),
    ).toBe('https://perenual.com/plant-species-database-search-finder/species/8758');
  });

  it('does not apply the explicit id to non-Perenual URLs', () => {
    expect(
      toUserFacingUrl('https://api.gbif.org/v1/species/2930137', 8759),
    ).toBe('https://www.gbif.org/species/2930137');
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

  it('rejects javascript: scheme (defense against malformed PlantSource.Url)', () => {
    expect(isUserFacingUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: scheme', () => {
    expect(isUserFacingUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects file: scheme', () => {
    expect(isUserFacingUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects malformed URLs that fail to parse', () => {
    expect(isUserFacingUrl('not a url')).toBe(false);
    expect(isUserFacingUrl('://')).toBe(false);
  });

  it('matches /api/ on pathname only, not the hostname', () => {
    // A site hosted at api.example.com is fine — the /api/ filter is a
    // pathname check, so the link survives.
    expect(isUserFacingUrl('https://api.example.com/species/123')).toBe(true);
    // But a path that begins with /api/ is rejected, even on a non-API host.
    expect(isUserFacingUrl('https://example.com/api/v1/species/123')).toBe(false);
  });
});
