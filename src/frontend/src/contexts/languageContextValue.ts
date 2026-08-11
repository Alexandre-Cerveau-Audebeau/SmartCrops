import { createContext } from 'react';
import type { Language } from '../i18n/languageStorage';

// Re-exported so consumers of the context value keep one import site; the
// type itself is owned by the neutral languageStorage module (SMA-393 R1).
export type { Language };

export interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const LanguageContext = createContext<LanguageContextValue>({
  language: 'fr',
  setLanguage: () => {},
});
