import { addDays, formatBangkokTime, type HolidayDto, type SessionDto, toBangkokDate, WORKDAY_STANDARD } from '@attendance/shared';
import { holidayMap } from '../../domain/holidays';
import { t } from '../../i18n';

/**
 * Working-time summary for the Hours tab, computed on the phone from GET /attendance/history.
 * - A session belongs to the Bangkok day of its check-in (same rule as the history screen).
 * - A session still open today counts until "now" (shown as running).
 * - A past session without a check-out has no known end: it counts as 0 and is flagged, so the staff member can
 *   request a correction instead of seeing an invented number.
 * - A finished day is compared with the standard working day (WORKDAY_STANDARD, 7–9 h): below, within or over.
 *   Today while still checked in, and any day with a missing check-out, get no verdict.
 * - Holidays (calendar) are days off: they are never compared with the standard, even when someone worked.
 */

/** Verdict for one day against the 7–9 h standard; null = not judged (no work, still running, or incomplete). */
export type DayStandard = 'BELOW' | 'WITHIN' | 'ABOVE';

export function standardFor(minutes: number): DayStandard {
  if (minutes < WORKDAY_STANDARD.minMinutes) return 'BELOW';
  if (minutes > WORKDAY_STANDARD.maxMinutes) return 'ABOVE';
  return 'WITHIN';
}

export type HoursPeriod = 'WEEK' | 'MONTH';

export interface HoursSession {
  id: string;
  inTime: string;
  outTime: string | null;
  minutes: number;
  running: boolean;
  missingCheckOut: boolean;
  corrected: boolean;
}

export interface HoursDay {
  date: string;
  minutes: number;
  sessions: HoursSession[];
  running: boolean;
  missingCheckOut: boolean;
  /** First check-in of the day ("09:00"), null on a day without attendance. */
  arrivedAt: string | null;
  /** Last check-out of the day ("17:00"); null while still checked in or when the check-out is missing. */
  leftAt: string | null;
  standard: DayStandard | null;
  /** Holiday on this date (no attendance expected; not judged against the standard). */
  holiday: HolidayDto | null;
}

export interface HoursSummary {
  from: string;
  to: string;
  /** Every calendar day in the period, oldest first (days without work have minutes 0 and no sessions). */
  days: HoursDay[];
  totalMinutes: number;
  daysWorked: number;
  averageMinutes: number;
  longestDay: HoursDay | null;
  running: boolean;
  missingCheckOuts: number;
  /** Finished days compared with the standard, and how many were below / within / over it. */
  judgedDays: number;
  withinDays: number;
  belowDays: number;
  aboveDays: number;
}

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

/** The week (Monday–Sunday) or calendar month containing `anchor`. */
export function periodRange(period: HoursPeriod, anchor: string): { from: string; to: string } {
  if (period === 'WEEK') {
    const back = (utc(anchor).getUTCDay() + 6) % 7;
    const from = addDays(anchor, -back);
    return { from, to: addDays(from, 6) };
  }
  const d = utc(anchor);
  const from = `${anchor.slice(0, 7)}-01`;
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return { from, to: `${anchor.slice(0, 7)}-${String(last).padStart(2, '0')}` };
}

/** Anchor date of the previous / next period. */
export function shiftPeriod(period: HoursPeriod, anchor: string, step: -1 | 1): string {
  if (period === 'WEEK') return addDays(anchor, 7 * step);
  const d = utc(`${anchor.slice(0, 7)}-01`);
  const moved = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + step, 1));
  return moved.toISOString().slice(0, 10);
}

/** Whole minutes between check-in and check-out (or now for a session still open today). */
export function sessionMinutes(s: Pick<SessionDto, 'checkInAt' | 'checkOutAt'>, today: string, now: Date): { minutes: number; running: boolean; missing: boolean } {
  const start = new Date(s.checkInAt).getTime();
  if (s.checkOutAt) return { minutes: Math.max(0, Math.floor((new Date(s.checkOutAt).getTime() - start) / 60_000)), running: false, missing: false };
  if (toBangkokDate(s.checkInAt) === today) {
    return { minutes: Math.max(0, Math.floor((now.getTime() - start) / 60_000)), running: true, missing: false };
  }
  return { minutes: 0, running: false, missing: true };
}

export function summarizeHours(
  sessions: SessionDto[],
  from: string,
  to: string,
  now: Date = new Date(),
  holidays: readonly HolidayDto[] = [],
): HoursSummary {
  const today = toBangkokDate(now);
  const holidayOn = holidayMap(holidays);
  const byDate = new Map<string, HoursDay>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    byDate.set(d, {
      date: d,
      minutes: 0,
      sessions: [],
      running: false,
      missingCheckOut: false,
      arrivedAt: null,
      leftAt: null,
      standard: null,
      holiday: holidayOn.get(d) ?? null,
    });
  }

  for (const s of [...sessions].sort((a, b) => a.checkInAt.localeCompare(b.checkInAt))) {
    const day = byDate.get(toBangkokDate(s.checkInAt));
    if (!day) continue;
    const m = sessionMinutes(s, today, now);
    day.minutes += m.minutes;
    day.running ||= m.running;
    day.missingCheckOut ||= m.missing;
    day.sessions.push({
      id: s.id,
      inTime: formatBangkokTime(s.checkInAt),
      outTime: s.checkOutAt ? formatBangkokTime(s.checkOutAt) : null,
      minutes: m.minutes,
      running: m.running,
      missingCheckOut: m.missing,
      corrected: s.corrected,
    });
  }

  const days = [...byDate.values()];
  for (const d of days) {
    const first = d.sessions[0];
    const last = d.sessions[d.sessions.length - 1];
    d.arrivedAt = first?.inTime ?? null;
    d.leftAt = last && !last.running && !last.missingCheckOut ? last.outTime : null;
    d.standard = d.sessions.length > 0 && !d.running && !d.missingCheckOut && !d.holiday ? standardFor(d.minutes) : null;
  }
  const judged = days.filter((d) => d.standard !== null);
  const worked = days.filter((d) => d.minutes > 0);
  const totalMinutes = days.reduce((sum, d) => sum + d.minutes, 0);
  const longestDay = worked.reduce<HoursDay | null>((best, d) => (!best || d.minutes > best.minutes ? d : best), null);
  return {
    from,
    to,
    days,
    totalMinutes,
    daysWorked: worked.length,
    averageMinutes: worked.length ? Math.round(totalMinutes / worked.length) : 0,
    longestDay,
    running: days.some((d) => d.running),
    missingCheckOuts: days.reduce((n, d) => n + d.sessions.filter((s) => s.missingCheckOut).length, 0),
    judgedDays: judged.length,
    withinDays: judged.filter((d) => d.standard === 'WITHIN').length,
    belowDays: judged.filter((d) => d.standard === 'BELOW').length,
    aboveDays: judged.filter((d) => d.standard === 'ABOVE').length,
  };
}

/** "7 h 45 m" / "7 ชม. 45 นาที"; "45 m" under an hour; "0 h" for nothing. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0 && m === 0) return t('hours:duration.zero');
  if (h === 0) return t('hours:duration.minutes', { m: String(m) });
  if (m === 0) return t('hours:duration.hours', { h: String(h) });
  return t('hours:duration.hoursMinutes', { h: String(h), m: String(m) });
}

/** Compact decimal hours for chart labels: "7.8". */
export function decimalHours(minutes: number): string {
  return (Math.round((minutes / 60) * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

/** "7–9 h" / "7–9 ชม." for the standard working day. */
export function standardRangeLabel(): string {
  return t('hours:standard.range', { min: String(WORKDAY_STANDARD.minMinutes / 60), max: String(WORKDAY_STANDARD.maxMinutes / 60) });
}

/** How far a finished day is from the standard: "1 h 15 m short" / "30 m over"; null when within it. */
export function standardGap(day: Pick<HoursDay, 'minutes' | 'standard'>): string | null {
  if (day.standard === 'BELOW') return t('hours:standard.short', { duration: formatDuration(WORKDAY_STANDARD.minMinutes - day.minutes) });
  if (day.standard === 'ABOVE') return t('hours:standard.over', { duration: formatDuration(day.minutes - WORKDAY_STANDARD.maxMinutes) });
  return null;
}
