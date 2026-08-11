import { afterEach, describe, expect, it, vi } from 'vitest';
import { LANGUAGE_STORAGE_KEY, readStoredLanguage } from './languageStorage';

// SMA-393 R1 contract locks for the shared language reader: a stored supported
// choice always wins, everything else — unsupported value, missing key, a
// throwing localStorage — resolves to the French default.
describe('readStoredLanguage (SMA-393)', () => {
  afterEach(() => {
    localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it("returns a stored 'en'", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    expect(readStoredLanguage()).toBe('en');
  });

  it("returns a stored 'fr'", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    expect(readStoredLanguage()).toBe('fr');
  });

  it("resolves an unsupported stored value ('de') to French", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
    expect(readStoredLanguage()).toBe('fr');
  });

  it('resolves a missing key to French', () => {
    localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    expect(readStoredLanguage()).toBe('fr');
  });

  it('resolves a throwing localStorage.getItem to French', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readStoredLanguage()).toBe('fr');
  });
});
