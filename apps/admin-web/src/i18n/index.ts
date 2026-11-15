import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { th } from './th';

/**
 * Thai / English admin UI (react-i18next, bundled resources).
 * First visit: the browser language (any `th*` → Thai). After that: the choice from the language switch,
 * remembered in localStorage. `<html lang>` follows the language (screen readers, Thai line breaking).
 * Keys are type-checked against the English resources (i18next.d.ts); Thai must have the same shape.
 */
export const LANGUAGES = ['en', 'th'] as const;
export type Language = (typeof LANGUAGES)[number];
export const LANGUAGE_NAME: Record<Language, string> = { en: 'English', th: 'ไทย' };
const STORAGE_KEY = 'attendance.lang';

export const isLanguage = (v: unknown): v is Language => v === 'en' || v === 'th';

function saved(): Language | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isLanguage(v) ? v : null;
  } catch {
    return null;
  }
}

export function detectBrowserLanguage(): Language {
  const langs = typeof navigator !== 'undefined' ? [...(navigator.languages ?? []), navigator.language] : [];
  return langs.some((l) => l?.toLowerCase().startsWith('th')) ? 'th' : 'en';
}

function applyHtmlLang(lang: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

void i18n.use(initReactI18next).init({
  resources: { en, th },
  lng: saved() ?? detectBrowserLanguage(),
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: Object.keys(en),
  interpolation: { escapeValue: false }, // React escapes already
  returnNull: false,
  initAsync: false,
  showSupportNotice: false,
});
applyHtmlLang(i18n.language);
i18n.on('languageChanged', applyHtmlLang);

export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : 'en';
}

export async function setLanguage(lang: Language): Promise<void> {
  await i18n.changeLanguage(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // private mode: the switch still applies to this tab
  }
}

export { i18n };
export const t = i18n.t.bind(i18n);
