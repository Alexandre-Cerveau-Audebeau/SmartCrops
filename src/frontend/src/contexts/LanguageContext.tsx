import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import i18next from 'i18next';
import { LanguageContext } from './languageContextValue';
import type { Language } from './languageContextValue';

const STORAGE_KEY = 'smartcrops-language';
const SUPPORTED_LANGUAGES: ReadonlySet<string> = new Set(['en', 'fr']);

// SMA-393: French is the default for visitors with no stored choice — a
// stored 'en' or 'fr' always wins, and browser-language detection is
// deliberately out (deterministic first render).
function normalizeLanguage(value: string | null): Language {
  return value && SUPPORTED_LANGUAGES.has(value) ? (value as Language) : 'fr';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      return normalizeLanguage(localStorage.getItem(STORAGE_KEY));
    } catch {
      return 'fr';
    }
  });

  const setLanguage = (lang: Language) => {
    const normalized = normalizeLanguage(lang);
    setLanguageState(normalized);
    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      // localStorage unavailable
    }
  };

  useEffect(() => {
    i18next.changeLanguage(language);
    // SMA-56 (a11y): keep the document language in sync so screen readers
    // switch pronunciation with the UI.
    document.documentElement.lang = language;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}
