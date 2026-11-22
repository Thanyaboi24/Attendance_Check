import {
  addDays,
  DISPLAY_TIME_ZONE,
  bangkokLocalToIso,
  formatBangkokDateTime,
  formatBangkokTime,
  toBangkokDate,
} from '@attendance/shared';
import { currentLanguage, i18n, t } from '../i18n';
import type { en } from '../i18n/en';

/** `YYYY-MM-DD HH:mm` in Asia/Bangkok, or an em dash. */
export function fmtDateTime(iso: string | null | undefined): string {
  return iso ? formatBangkokDateTime(iso) : '—';
}

export function fmtTime(iso: string | null | undefined): string {
  return iso ? formatBangkokTime(iso) : '—';
}

export function todayBangkok(now: Date = new Date()): string {
  return toBangkokDate(now);
}

/** Inclusive range ending today (Bangkok) covering `days` days. */
export function lastDays(days: number, now: Date = new Date()): { from: string; to: string } {
  const to = todayBangkok(now);
  return { from: addDays(to, -(days - 1)), to };
}

/** Split a UTC instant into Bangkok `date` + `time` values for `<input type="date|time">`. */
export function isoToBangkokInputs(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  return { date: toBangkokDate(iso), time: formatBangkokTime(iso) };
}

/** Bangkok `date` + `HH:mm` (as typed by the admin) → UTC ISO string; null when either part is empty. */
export function bangkokInputsToIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  return bangkokLocalToIso(date, time.slice(0, 5));
}

export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export type EnumGroup = keyof (typeof en)['common']['enum'];

/**
 * Display label of an API enum value (`APPROVED`, `CHECK_IN`, …) in the current language.
 * Values without a translation fall back to `humanize` (still readable, never blank).
 */
export function enumLabel(
  group: EnumGroup,
  value: string | null | undefined,
  fallback: (v: string) => string = humanize,
): string {
  if (!value) return '—';
  const key = `common:enum.${group}.${value}`;
  return i18n.exists(key) ? (t as unknown as (k: string) => string)(key) : fallback(value);
}

export function methodLabel(m: string | null | undefined): string {
  return enumLabel('method', m);
}

/** Distance with the unit of the current language (`150 m` / `150 ม.`, `1.20 km` / `1.20 กม.`). */
export function fmtMetres(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—';
  return m >= 1000 ? t('common:units.km', { value: (m / 1000).toFixed(2) }) : t('common:units.m', { value: String(Math.round(m)) });
}

export function fmtSeconds(s: number): string {
  return t('common:units.sec', { value: String(s) });
}

/** Trigger a browser download of a blob. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- calendar dates (YYYY-MM-DD, Bangkok) ---------------------------------------------------------------------

const dateLocale = () => (currentLanguage() === 'th' ? 'th-TH' : 'en-GB');
/** Noon in Bangkok on a calendar date: safe from time-zone edges when formatting. */
const bangkokNoon = (date: string) => new Date(`${date}T12:00:00+07:00`);

function dateParts(date: string, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const parts = new Intl.DateTimeFormat(dateLocale(), { ...opts, timeZone: DISPLAY_TIME_ZONE }).formatToParts(bangkokNoon(date));
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

const THAI_WEEKDAY_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

/** Year as shown to the reader: `2026` / Buddhist Era `2569`. */
export function fmtYear(year: number): string {
  return String(currentLanguage() === 'th' ? year + 543 : year);
}

/** "Mon 7 Dec" / "จ. 7 ธ.ค." for a Bangkok calendar date (YYYY-MM-DD). */
export function fmtShortDate(date: string): string {
  if (Number.isNaN(bangkokNoon(date).getTime())) return date;
  const p = dateParts(date, { weekday: 'short', day: 'numeric', month: 'short' });
  // Browsers disagree on short Thai weekdays ("จ." vs "จันทร์"): use the standard abbreviations.
  const weekday =
    currentLanguage() === 'th' ? THAI_WEEKDAY_SHORT[new Date(`${date}T00:00:00Z`).getUTCDay()] : p.weekday;
  return `${weekday} ${p.day} ${p.month}`;
}

/** "Mon 7 Dec 2026" / "จ. 7 ธ.ค. 2569". */
export function fmtShortDateYear(date: string): string {
  return `${fmtShortDate(date)} ${fmtYear(Number(date.slice(0, 4)))}`;
}

/** "December 2026" / "ธันวาคม 2569" for a month (1–12) of a year. */
export function fmtMonthYear(year: number, month: number): string {
  const p = dateParts(`${year}-${String(month).padStart(2, '0')}-15`, { month: 'long' });
  return `${p.month} ${fmtYear(year)}`;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Holiday name in the current language (both names are data typed by administrators). */
export function holidayName(h: { nameEn: string; nameTh: string }): string {
  return currentLanguage() === 'th' ? h.nameTh || h.nameEn : h.nameEn || h.nameTh;
}
