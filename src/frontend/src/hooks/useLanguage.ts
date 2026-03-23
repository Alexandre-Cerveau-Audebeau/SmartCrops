import { useContext } from 'react';
import { LanguageContext } from '../contexts/languageContextValue';

export function useLanguage() {
  return useContext(LanguageContext);
}
