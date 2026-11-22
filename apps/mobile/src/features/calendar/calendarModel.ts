import { addDays, type HolidayDto } from '@attendance/shared';
import { daysBetween, holidayMap } from '../../domain/holidays';
import { currentLanguage, type Language } from '../../i18n';
import { monthYearLong, weekdayHeaders } from '../../i18n/format';

/**
 * Month grid for the Calendar tab (pure, no React): weeks start on Monday, days of the previous / next month fill
 * the first and last week. Holidays come from GET /calendar/holidays (or the local cache offline).
 */

export interface CalendarCell {
  date: string;
  day: number;
  /** False for the leading / trailing days of the neighbouring months. */
  inMonth: boolean;
  /** Saturday or Sunday. */
  weekend: boolean;
  today: boolean;
  holiday: HolidayDto | null;
}

export interface MonthGrid {
  year: number;
  /** 1–12 */
  month: number;
  /** "December 2026" / "ธันวาคม 2569" */
  title: string;
  /** Mon … Sun */
  weekdays: string[];
  /** 4–6 rows of 7 cells. */
  weeks: CalendarCell[][];
  /** Holidays of this month, oldest first. */
  holidays: HolidayDto[];
  /** First and last date of the month (inclusive), for fetching. */
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function monthBounds(year: number, month: number): { from: string; to: string } {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` };
}

/** Month containing a Bangkok date. */
export function monthOf(date: string): { year: number; month: number } {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

export function shiftMonth(ym: { year: number; month: number }, step: number): { year: number; month: number } {
  const idx = ym.year * 12 + (ym.month - 1) + step;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export function buildMonthGrid(
  year: number,
  month: number,
  holidays: readonly HolidayDto[],
  today: string,
  lang: Language = currentLanguage(),
): MonthGrid {
  const { from, to } = monthBounds(year, month);
  const byDate = holidayMap(holidays);
  // Monday on or before the 1st; Sunday on or after the last day.
  const start = addDays(from, -((weekdayOf(from) + 6) % 7));
  const end = addDays(to, (7 - weekdayOf(to)) % 7);
  const weeks: CalendarCell[][] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if ((weeks[weeks.length - 1]?.length ?? 7) === 7) weeks.push([]);
    const wd = weekdayOf(d);
    (weeks[weeks.length - 1] as CalendarCell[]).push({
      date: d,
      day: Number(d.slice(8)),
      inMonth: d >= from && d <= to,
      weekend: wd === 0 || wd === 6,
      today: d === today,
      holiday: byDate.get(d) ?? null,
    });
  }
  return {
    year,
    month,
    title: monthYearLong(year, month, lang),
    weekdays: weekdayHeaders(lang),
    weeks,
    holidays: [...holidays].filter((h) => h.date >= from && h.date <= to).sort((a, b) => a.date.localeCompare(b.date)),
    from,
    to,
  };
}

export type DayKind = 'HOLIDAY' | 'WEEKEND' | 'WORKING';

export function dayKind(cell: Pick<CalendarCell, 'holiday' | 'weekend'>): DayKind {
  if (cell.holiday) return 'HOLIDAY';
  return cell.weekend ? 'WEEKEND' : 'WORKING';
}

/** Next holiday on or after today, with the number of days until it (0 = today). */
export function nextHoliday(holidays: readonly HolidayDto[], today: string): { holiday: HolidayDto; inDays: number } | null {
  const next = [...holidays].filter((h) => h.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  return next ? { holiday: next, inDays: daysBetween(today, next.date) } : null;
}
