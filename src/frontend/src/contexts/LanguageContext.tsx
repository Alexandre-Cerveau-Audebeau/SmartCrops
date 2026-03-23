import { useState } from 'react';
import type { ReactNode } from 'react';
import { LanguageContext } from './languageContextValue';

const STORAGE_KEY = 'smartcrops-language';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? 'en';
    } catch {
      return 'en';
    }
  });

  const setLanguage = (lang: string) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
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
