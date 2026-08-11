// SMA-393 R1: the single owner of the stored-language contract — the storage
// key, the supported set and the French no-choice default. Both initialization
// paths (the i18next init and the LanguageProvider) read through here, so a
// future locale cannot make them resolve a first visit differently.
export type Language = 'en' | 'fr';

export const LANGUAGE_STORAGE_KEY = 'smartcrops-language';

const SUPPORTED_LANGUAGES: ReadonlySet<string> = new Set(['en', 'fr']);

// A stored supported value always wins; anything else resolves to French —
// browser-language detection is deliberately out (deterministic first render).
export function normalizeLanguage(value: string | null): Language {
  return value && SUPPORTED_LANGUAGES.has(value) ? (value as Language) : 'fr';
}

export function readStoredLanguage(): Language {
  try {
    return normalizeLanguage(
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(LANGUAGE_STORAGE_KEY)
        : null
    );
  } catch {
    // localStorage unavailable or throwing (privacy mode): the default wins.
    return 'fr';
  }
}
