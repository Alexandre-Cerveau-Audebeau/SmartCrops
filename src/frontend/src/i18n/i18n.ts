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

// SMA-354: keep <html lang> aligned with the active language — the static
// lang="fr" in index.html only covers the pre-hydration state. Regioned codes
// ("fr-FR") are normalized to their 2-letter base.
const syncDocumentLanguage = (lng: string) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng.split('-')[0];
  }
};

syncDocumentLanguage(i18next.language);
i18next.on('languageChanged', syncDocumentLanguage);

export default i18next;
