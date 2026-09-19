import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import tr from './locales/tr.json';

/**
 * Merkezi i18n — TEK kaynak. Çeviri içerikleri `./locales/*.json` içinde.
 * Yeni dil = 1 json dosyası + aşağıdaki resources'a 1 satır + app.json
 * `supportedLocales`'a 1 satır. Hiçbir ekranda gömülü string yok.
 */
export const resources = {
  en: { translation: en },
  tr: { translation: tr },
} as const;

export type AppLocale = keyof typeof resources;
export const SUPPORTED_LOCALES: AppLocale[] = ['tr', 'en'];
export const FALLBACK_LOCALE: AppLocale = 'en';

function detectLocale(): AppLocale {
  const code = getLocales()[0]?.languageCode ?? FALLBACK_LOCALE;
  return (SUPPORTED_LOCALES as string[]).includes(code) ? (code as AppLocale) : FALLBACK_LOCALE;
}

i18n.use(initReactI18next).init({
  resources,
  lng: detectLocale(),
  fallbackLng: FALLBACK_LOCALE,
  interpolation: { escapeValue: false },
});

export default i18n;
