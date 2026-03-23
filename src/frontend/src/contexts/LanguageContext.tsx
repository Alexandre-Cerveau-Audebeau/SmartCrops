import { useState } from 'react';
import type { ReactNode } from 'react';
import { LanguageContext } from './languageContextValue';
import type { Language } from './languageContextValue';

const STORAGE_KEY = 'smartcrops-language';
const SUPPORTED_LANGUAGES: ReadonlySet<string> = new Set(['en', 'fr']);

function normalizeLanguage(value: string | null): Language {
  return value && SUPPORTED_LANGUAGES.has(value) ? (value as Language) : 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      return normalizeLanguage(localStorage.getItem(STORAGE_KEY));
    } catch {
      return 'en';
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

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}
