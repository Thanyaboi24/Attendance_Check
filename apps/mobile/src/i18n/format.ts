import { formatBangkokTime, toBangkokDate } from '@attendance/shared';
import { currentLanguage, type Language } from './index';

/**
 * Calendar labels for Bangkok dates (`YYYY-MM-DD`), without Intl (identical on Hermes, Node and every phone).
 * Thai uses Thai day/month abbreviations and the Buddhist Era year (Gregorian + 543), as Thai readers expect.
 * Times stay 24-hour `HH:mm` in both languages.
 */
const WEEKDAY: Record<Language, readonly string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  th: ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'],
};
const WEEKDAY_LONG: Record<Language, readonly string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  th: ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'],
};
const MONTH: Record<Language, readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  th: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
};

const MONTH_LONG: Record<Language, readonly string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  th: ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'],
};

function parts(date: string) {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, weekday };
}

const year = (y: number, lang: Language) => (lang === 'th' ? y + 543 : y);

/** "Thu 29 Oct" / "พฤ. 29 ต.ค." */
export function dayShort(date: string, lang: Language = currentLanguage()): string {
  const p = parts(date);
  return `${WEEKDAY[lang][p.weekday]} ${p.d} ${MONTH[lang][p.m - 1]}`;
}

/** "Thursday 29 Oct 2026" / "วันพฤหัสบดี 29 ต.ค. 2569" */
export function dayLong(date: string, lang: Language = currentLanguage()): string {
  const p = parts(date);
  return `${WEEKDAY_LONG[lang][p.weekday]} ${p.d} ${MONTH[lang][p.m - 1]} ${year(p.y, lang)}`;
}

/** "29 Oct" / "29 ต.ค." */
export function dayMonth(date: string, lang: Language = currentLanguage()): string {
  const p = parts(date);
  return `${p.d} ${MONTH[lang][p.m - 1]}`;
}

/** "29 Oct 2026" / "29 ต.ค. 2569" */
export function dayMonthYear(date: string, lang: Language = currentLanguage()): string {
  const p = parts(date);
  return `${p.d} ${MONTH[lang][p.m - 1]} ${year(p.y, lang)}`;
}

/** "27 Oct – 31 Oct 2026"; both years shown when they differ. */
export function dateRange(from: string, to: string, lang: Language = currentLanguage()): string {
  const a = parts(from);
  const b = parts(to);
  return a.y === b.y ? `${dayMonth(from, lang)} – ${dayMonthYear(to, lang)}` : `${dayMonthYear(from, lang)} – ${dayMonthYear(to, lang)}`;
}

/** "29 Oct 2026 14:05" / "29 ต.ค. 2569 14:05" for an instant, in Bangkok time. */
export function dateTime(iso: string, lang: Language = currentLanguage()): string {
  return `${dayMonthYear(toBangkokDate(iso), lang)} ${formatBangkokTime(iso)}`;
}

/** "December 2026" / "ธันวาคม 2569" (month 1–12; Buddhist Era year in Thai). */
export function monthYearLong(y: number, m: number, lang: Language = currentLanguage()): string {
  return `${MONTH_LONG[lang][m - 1]} ${year(y, lang)}`;
}

/** Short weekday names Monday → Sunday (calendar grid headers): "Mon" … "Sun" / "จ." … "อา.". */
export function weekdayHeaders(lang: Language = currentLanguage()): string[] {
  return [1, 2, 3, 4, 5, 6, 0].map((i) => WEEKDAY[lang][i] as string);
}
