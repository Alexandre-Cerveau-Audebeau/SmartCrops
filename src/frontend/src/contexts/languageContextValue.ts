import { createContext } from 'react';

export interface LanguageContextValue {
  language: string;
  setLanguage: (lang: string) => void;
}

export const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
});
