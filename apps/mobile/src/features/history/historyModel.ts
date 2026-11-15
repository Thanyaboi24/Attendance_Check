import { addDays, type AttendanceRequestDto, formatBangkokTime, type Method, RequestType, type SessionDto, toBangkokDate } from '@attendance/shared';
import { currentLanguage, t } from '../../i18n';
import { dateRange, dayShort } from '../../i18n/format';

export type HistoryStatus = 'COMPLETED' | 'OPEN' | 'NEEDS_REVIEW' | 'CORRECTED';

/** Status pill text (current language). */
export function historyStatusLabel(status: HistoryStatus): string {
  return t(`history:status.${status}`);
}

/** "Manual" / "Automatic" / "Admin corrected" (current language). */
export function methodLabel(method: Method): string {
  return t(`history:method.${method}`);
}

/** One card on the history screen (mockup page 6): a session, or a day with only an unresolved request. */
export interface HistoryCard {
  key: string;
  workDate: string;
  dayLabel: string;
  status: HistoryStatus;
  inTime: string | null;
  inLabel: string;
  outTime: string | null;
  outLabel: string;
  inMethod: Method | null;
  outMethod: Method | null;
  sessionId: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  /** Shows "Request a correction". */
  needsCorrection: boolean;
}

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

/** "Fri 31 Oct" / "ศ. 31 ต.ค." for a Bangkok calendar date (YYYY-MM-DD). */
export function dayLabel(date: string): string {
  return dayShort(date);
}

/** "Wed 29 Oct 2026" / "พ. 29 ต.ค. 2569" (Buddhist Era year in Thai). */
export function longDayLabel(date: string): string {
  const y = utc(date).getUTCFullYear();
  return `${dayShort(date)} ${currentLanguage() === 'th' ? y + 543 : y}`;
}

/** "27 Oct – 31 Oct 2026" (year shown once when both ends share it). */
export function rangeLabel(from: string, to: string): string {
  return dateRange(from, to);
}

export type RangePreset = 'THIS_WEEK' | 'LAST_7' | 'LAST_30';

/** Range menu labels (current language); call at render time. */
export function rangePresetLabels(): Record<RangePreset, string> {
  return { THIS_WEEK: t('history:range.THIS_WEEK'), LAST_7: t('history:range.LAST_7'), LAST_30: t('history:range.LAST_30') };
}

/** Date range for a preset, as Bangkok calendar dates. A week starts on Monday. */
export function presetRange(preset: RangePreset, today: string): { from: string; to: string } {
  switch (preset) {
    case 'THIS_WEEK': {
      const back = (utc(today).getUTCDay() + 6) % 7;
      return { from: addDays(today, -back), to: today };
    }
    case 'LAST_7':
      return { from: addDays(today, -6), to: today };
    case 'LAST_30':
      return { from: addDays(today, -29), to: today };
  }
}

export type MethodFilter = 'ALL' | Method;

/** Method menu labels (current language); call at render time. */
export function methodFilterLabels(): Record<MethodFilter, string> {
  return { ALL: t('history:allMethods'), MANUAL: methodLabel('MANUAL'), AUTOMATIC: methodLabel('AUTOMATIC'), ADMIN_CORRECTED: methodLabel('ADMIN_CORRECTED') };
}

type IssueLike = Pick<AttendanceRequestDto, 'id' | 'type' | 'geofenceDetectedAt'>;

/**
 * Turns the server's sessions + unresolved requests (GET /attendance/history) into history cards, newest first.
 * A past session without a check-out needs review; an unresolved request on a day without a session gets its own card.
 */
export function buildHistoryCards(sessions: SessionDto[], issues: IssueLike[], today: string): HistoryCard[] {
  const cards: HistoryCard[] = [];
  const issueDates = (type: RequestType) => new Set(issues.filter((i) => i.type === type).map((i) => toBangkokDate(i.geofenceDetectedAt)));
  const outIssues = issueDates(RequestType.CHECK_OUT);
  const sessionDates = new Set<string>();

  for (const s of sessions) {
    const workDate = toBangkokDate(s.checkInAt);
    sessionDates.add(workDate);
    let status: HistoryStatus;
    let outLabel: string;
    if (s.checkOutAt) {
      status = s.corrected ? 'CORRECTED' : 'COMPLETED';
      outLabel = s.checkOutMethod ? methodLabel(s.checkOutMethod) : '';
    } else if (workDate === today) {
      status = s.corrected ? 'CORRECTED' : 'OPEN';
      outLabel = t('history:cell.notYet');
    } else {
      status = 'NEEDS_REVIEW';
      outLabel = outIssues.has(workDate) ? t('history:cell.unresolved') : t('history:cell.missing');
    }
    cards.push({
      key: s.id,
      workDate,
      dayLabel: dayLabel(workDate),
      status,
      inTime: formatBangkokTime(s.checkInAt),
      inLabel: methodLabel(s.checkInMethod),
      outTime: s.checkOutAt ? formatBangkokTime(s.checkOutAt) : null,
      outLabel,
      inMethod: s.checkInMethod,
      outMethod: s.checkOutMethod,
      sessionId: s.id,
      checkInAt: s.checkInAt,
      checkOutAt: s.checkOutAt,
      needsCorrection: status === 'NEEDS_REVIEW',
    });
  }

  // Unresolved requests on days with no session at all (e.g. check-in never recorded).
  const orphanDates = new Set(issues.map((i) => toBangkokDate(i.geofenceDetectedAt)).filter((d) => !sessionDates.has(d)));
  for (const workDate of orphanDates) {
    cards.push({
      key: `issue-${workDate}`,
      workDate,
      dayLabel: dayLabel(workDate),
      status: 'NEEDS_REVIEW',
      inTime: null,
      inLabel: t('history:cell.unresolved'),
      outTime: null,
      outLabel: '',
      inMethod: null,
      outMethod: null,
      sessionId: null,
      checkInAt: null,
      checkOutAt: null,
      needsCorrection: true,
    });
  }

  return cards.sort((a, b) => (b.workDate === a.workDate ? (b.checkInAt ?? '').localeCompare(a.checkInAt ?? '') : b.workDate.localeCompare(a.workDate)));
}

export function filterByMethod(cards: HistoryCard[], filter: MethodFilter): HistoryCard[] {
  if (filter === 'ALL') return cards;
  return cards.filter((c) => c.inMethod === filter || c.outMethod === filter);
}
