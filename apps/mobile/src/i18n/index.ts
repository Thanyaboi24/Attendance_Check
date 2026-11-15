import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { th } from './th';

/**
 * Thai / English UI (react-i18next). Resources are bundled; no network, no native module.
 * - The first language is the phone's language (Thai phones get Thai), then the user's choice in Settings.
 * - The choice is stored in the local `meta` table, so background tasks (headless JS: notifications posted by the
 *   geofence task) use the same language as the UI — `restoreSavedLanguage()` runs at the JS entry point.
 * - Keys are type-checked against the English resources (see i18next.d.ts); Thai must have the same shape.
 */
export const LANGUAGES = ['en', 'th'] as const;
export type Language = (typeof LANGUAGES)[number];
export const LANGUAGE_META_KEY = 'language';

/** Name of each language in its own script, for the switcher. */
export const LANGUAGE_NAME: Record<Language, string> = { en: 'English', th: 'ไทย' };

export function isLanguage(v: unknown): v is Language {
  return v === 'en' || v === 'th';
}

/** Phone language → supported language (Thai for any `th*` locale, otherwise English). */
export function detectDeviceLanguage(): Language {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    return locale.toLowerCase().startsWith('th') ? 'th' : 'en';
  } catch {
    return 'en';
  }
}

void i18n.use(initReactI18next).init({
  resources: { en, th },
  lng: detectDeviceLanguage(),
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: Object.keys(en),
  interpolation: { escapeValue: false }, // React Native does not render HTML
  returnNull: false,
  initAsync: false,
  showSupportNotice: false,
});

export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : 'en';
}

/** Applies the language saved in Settings (if any). Safe to call from headless tasks. */
export async function restoreSavedLanguage(): Promise<void> {
  try {
    const { getDeps } = await import('../app/container');
    const saved = await (await getDeps()).store.getMeta(LANGUAGE_META_KEY);
    if (isLanguage(saved) && saved !== i18n.language) await i18n.changeLanguage(saved);
  } catch {
    // Keep the device language; the UI still works.
  }
}

/** Switches the UI language now and remembers it on this phone. */
export async function setLanguage(lang: Language): Promise<void> {
  await i18n.changeLanguage(lang);
  try {
    const { getDeps } = await import('../app/container');
    await (await getDeps()).store.setMeta(LANGUAGE_META_KEY, lang);
  } catch {
    // Not persisted (e.g. storage unavailable); the switch still applies for this run.
  }
}

export { i18n };
export const t = i18n.t.bind(i18n);
