/**
 * i18n Configuration
 *
 * Initialises i18next with bundled EN/ES resources.
 * Language is detected synchronously from expo-localization at startup.
 * Import this file as the very first import in app/_layout.tsx.
 */

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from '../../assets/locales/en.json';
import es from '../../assets/locales/es.json';

const deviceLocale = getLocales()[0]?.languageCode ?? 'en';
const language = deviceLocale.startsWith('es') ? 'es' : 'en';

i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: language,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  compatibilityJSON: 'v4',
});

export default i18next;
