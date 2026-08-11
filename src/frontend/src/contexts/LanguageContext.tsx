import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import i18next from 'i18next';
import { LanguageContext } from './languageContextValue';
import type { Language } from './languageContextValue';
import {
  LANGUAGE_STORAGE_KEY,
  normalizeLanguage,
  readStoredLanguage,
} from '../i18n/languageStorage';

export function LanguageProvider({ children }: { children: ReactNode }) {
  // SMA-393: the shared reader owns the stored-key contract — a stored choice
  // always wins, no choice resolves to French (detection deliberately out).
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  const setLanguage = (lang: Language) => {
    const normalized = normalizeLanguage(lang);
    setLanguageState(normalized);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
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
