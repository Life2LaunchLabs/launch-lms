'use client'

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from '../locales/en.json';
import { READY_LANGUAGES } from './languages';

const LOCALE_LOADERS: Record<string, () => Promise<{ default: any }>> = {
  fr: () => import('../locales/fr.json'),
  de: () => import('../locales/de.json'),
  es: () => import('../locales/es.json'),
  ar: () => import('../locales/ar.json'),
  ja: () => import('../locales/ja.json'),
  pt: () => import('../locales/pt.json'),
  ru: () => import('../locales/ru.json'),
  zh: () => import('../locales/zh.json'),
  hi: () => import('../locales/hi.json'),
  ko: () => import('../locales/ko.json'),
  it: () => import('../locales/it.json'),
  tr: () => import('../locales/tr.json'),
  vi: () => import('../locales/vi.json'),
  id: () => import('../locales/id.json'),
  pl: () => import('../locales/pl.json'),
  nl: () => import('../locales/nl.json'),
  th: () => import('../locales/th.json'),
  bn: () => import('../locales/bn.json'),
};

// Only bundle English; lazy-load all other locales on demand
const resources = {
  en: { common: en },
};

export async function loadLocale(code: string) {
  const lng = (code || '').split('-')[0]
  if (typeof document !== 'undefined' && lng) document.documentElement.lang = lng
  if (lng === 'en' || !LOCALE_LOADERS[lng]) return;
  if (i18n.hasResourceBundle(lng, 'common')) return;

  try {
    const mod = await LOCALE_LOADERS[lng]();
    i18n.addResourceBundle(lng, 'common', mod.default, true, true);
  } catch (e) {
    console.warn(`Failed to load locale: ${lng}`, e);
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    // Only finished languages are used; "es-MX" resolves to "es", and anything else to English.
    supportedLngs: [...READY_LANGUAGES],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    ns: ['common'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
    detection: {
      order: ['querystring', 'localStorage', 'cookie', 'navigator'],
      lookupQuerystring: 'lang',
      caches: ['localStorage', 'cookie'],
      lookupLocalStorage: 'i18nextLng',
      lookupCookie: 'i18next',
    },
    react: {
      useSuspense: false,
      // Re-render when a lazily loaded language file arrives, not only when the language changes.
      bindI18nStore: 'added',
    }
  });

// Load the detected language if it's not English
loadLocale(i18n.language);

// Load locale whenever the language changes
i18n.on('languageChanged', loadLocale);

export default i18n;
