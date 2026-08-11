import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import fr from './fr.json';
import { readStoredLanguage } from './languageStorage';

i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  // SMA-393: the shared reader resolves a first visit to French, so the very
  // first i18next render already matches what the provider will apply.
  lng: readStoredLanguage(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

export default i18next;
