import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import fr from './fr.json';

// SMA-393: no stored choice → French, mirroring LanguageContext's default so
// the very first i18next render already matches what the provider will apply.
function getInitialLanguage(): string {
  try {
    const stored =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('smartcrops-language')
        : null;
    return stored === 'en' || stored === 'fr' ? stored : 'fr';
  } catch {
    return 'fr';
  }
}

i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

export default i18next;
