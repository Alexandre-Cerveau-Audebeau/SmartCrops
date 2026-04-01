import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import fr from './fr.json';

function getInitialLanguage(): string {
  try {
    const stored =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('smartcrops-language')
        : null;
    return stored === 'en' || stored === 'fr' ? stored : 'en';
  } catch {
    return 'en';
  }
}

i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18next;
