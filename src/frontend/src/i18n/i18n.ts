import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import fr from './fr.json';

i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: localStorage.getItem('smartcrops-language') || 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18next;
