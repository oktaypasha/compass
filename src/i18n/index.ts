import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, { changeLanguage } from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './locales/ar.json';
import bn from './locales/bn.json';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import id from './locales/id.json';
import it from './locales/it.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import tr from './locales/tr.json';
import ur from './locales/ur.json';
import zh from './locales/zh.json';

/**
 * Merkezi i18n — TEK kaynak. Çeviriler `./locales/*.json` içinde.
 *
 * Yeni dil = 1 json + burada 3 satır (import, resources, LANGUAGES kaydı).
 * Hiçbir ekranda gömülü string yok.
 */
export const resources = {
  ar: { translation: ar },
  bn: { translation: bn },
  de: { translation: de },
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  hi: { translation: hi },
  id: { translation: id },
  it: { translation: it },
  pt: { translation: pt },
  ru: { translation: ru },
  tr: { translation: tr },
  ur: { translation: ur },
  zh: { translation: zh },
} as const;

export type AppLocale = keyof typeof resources;
export const FALLBACK_LOCALE: AppLocale = 'en';
const LANGUAGE_STORAGE_KEY = 'compass.language.v1';

/**
 * Dil listesi — sıralama sabittir (menüde bu sırada görünür).
 *
 * `flag` bilinçli olarak bayrak emojisi olarak tutulur: SVG/PNG bayrak
 * gömmek asset yükü ve "hangi ülkeye ait" tartışması getirir; emoji her
 * platformda renkli çizilir. RTL diller `rtl: true` ile işaretlidir.
 */
export interface LanguageDef {
  code: AppLocale;
  /** Kendi dilinde ad — kullanıcı tanımasın, çeviri gerektirmesin. */
  label: string;
  flag: string;
  rtl: boolean;
}

export const LANGUAGES: LanguageDef[] = [
  { code: 'en', label: 'English', flag: '🇬🇧', rtl: false },
  { code: 'zh', label: '中文', flag: '🇨🇳', rtl: false },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳', rtl: false },
  { code: 'es', label: 'Español', flag: '🇪🇸', rtl: false },
  { code: 'fr', label: 'Français', flag: '🇫🇷', rtl: false },
  { code: 'ar', label: 'العربية', flag: '🇸🇦', rtl: true },
  { code: 'bn', label: 'বাংলা', flag: '🇧🇩', rtl: false },
  { code: 'pt', label: 'Português', flag: '🇵🇹', rtl: false },
  { code: 'ru', label: 'Русский', flag: '🇷🇺', rtl: false },
  { code: 'ur', label: 'اردو', flag: '🇵🇰', rtl: true },
  { code: 'id', label: 'Bahasa Indonesia', flag: '🇮🇩', rtl: false },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪', rtl: false },
  { code: 'it', label: 'Italiano', flag: '🇮🇹', rtl: false },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷', rtl: false },
];

const SUPPORTED = LANGUAGES.map((l) => l.code);

/** Cihazın dilini uygulamanın desteklediği bir dile eşler (`pt-BR` → `pt`). */
export function matchDeviceLocale(): AppLocale {
  const candidates = getLocales().map((l) => (l.languageCode ?? '').toLowerCase());
  for (const c of candidates) {
    if ((SUPPORTED as string[]).includes(c)) return c as AppLocale;
    const base = (c ?? '').split('-')[0] ?? '';
    if ((SUPPORTED as string[]).includes(base)) return base as AppLocale;
  }
  return FALLBACK_LOCALE;
}

export function isRtl(locale: string): boolean {
  return LANGUAGES.find((l) => l.code === locale)?.rtl ?? false;
}

// Plugin + init tek ifadede olmalı; kural bu zinciri yanlış sanıyor.
// eslint-disable-next-line import/no-named-as-default-member
i18n.use(initReactI18next).init({
  resources,
  // İlk kare telefon dilinde açılır; kayıtlı tercih varsa hemen ezilir
  // (i18next senkron çalıştığı için yeniden başlatma gerekmez).
  lng: matchDeviceLocale(),
  fallbackLng: FALLBACK_LOCALE,
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Kayıtlı dil tercihini uygular. Çağırmak zorunlu değil (yoksa cihaz dili kalır). */
export async function applyStoredLanguage(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && (SUPPORTED as string[]).includes(stored)) {
      await changeLanguage(stored);
    }
  } catch {
    // Depo okunamazsa cihaz diliyle devam et.
  }
}

/** Dili değiştirir ve kalıcılaştırır — anında uygulanır, yeniden başlatma yok. */
export async function setLanguage(code: AppLocale): Promise<void> {
  await changeLanguage(code);
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    // Yazılamazsa yalnızca bu oturumda geçerli.
  }
}

export { i18n };
export default i18n;
