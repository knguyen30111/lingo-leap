import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import all translation files
import enCommon from '../locales/en/common.json';
import enSettings from '../locales/en/settings.json';
import enSetup from '../locales/en/setup.json';
import enMessages from '../locales/en/messages.json';

import viCommon from '../locales/vi/common.json';
import viSettings from '../locales/vi/settings.json';
import viSetup from '../locales/vi/setup.json';
import viMessages from '../locales/vi/messages.json';

import jaCommon from '../locales/ja/common.json';
import jaSettings from '../locales/ja/settings.json';
import jaSetup from '../locales/ja/setup.json';
import jaMessages from '../locales/ja/messages.json';

import koCommon from '../locales/ko/common.json';
import koSettings from '../locales/ko/settings.json';
import koSetup from '../locales/ko/setup.json';
import koMessages from '../locales/ko/messages.json';

// Supported UI languages for interface
export const UI_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
] as const;

export type UILanguageCode = typeof UI_LANGUAGES[number]['code'];

// Resources object with all translations
const resources = {
  en: {
    common: enCommon,
    settings: enSettings,
    setup: enSetup,
    messages: enMessages,
  },
  vi: {
    common: viCommon,
    settings: viSettings,
    setup: viSetup,
    messages: viMessages,
  },
  ja: {
    common: jaCommon,
    settings: jaSettings,
    setup: jaSetup,
    messages: jaMessages,
  },
  ko: {
    common: koCommon,
    settings: koSettings,
    setup: koSetup,
    messages: koMessages,
  },
};

// Initialize i18next
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'settings', 'setup', 'messages'],

    interpolation: {
      escapeValue: false, // React already handles XSS
    },

    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'tran-app-ui-language',
      caches: ['localStorage'],
    },

    react: {
      useSuspense: false, // Disable suspense for simpler loading
    },
  });

// Function to change language programmatically
export const changeLanguage = (lng: UILanguageCode) => {
  i18n.changeLanguage(lng);
  localStorage.setItem('tran-app-ui-language', lng);
};

// Get current language
export const getCurrentLanguage = (): UILanguageCode => {
  return (i18n.language || 'en') as UILanguageCode;
};

export default i18n;
