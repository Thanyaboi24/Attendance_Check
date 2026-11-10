import { addDays, type AttendanceRequestDto, formatBangkokTime, type Method, RequestType, type SessionDto, toBangkokDate } from '@attendance/shared';

export type HistoryStatus = 'COMPLETED' | 'OPEN' | 'NEEDS_REVIEW' | 'CORRECTED';

export const HISTORY_STATUS_LABEL: Record<HistoryStatus, string> = {
  COMPLETED: 'Completed',
  OPEN: 'Open',
  NEEDS_REVIEW: 'Needs review',
  CORRECTED: 'Corrected',
};

export const METHOD_LABEL: Record<Method, string> = {
  MANUAL: 'Manual',
  AUTOMATIC: 'Automatic',
  ADMIN_CORRECTED: 'Admin corrected',
};

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

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

/** "Fri 31 Oct" for a Bangkok calendar date (YYYY-MM-DD). */
export function dayLabel(date: string): string {
  const d = utc(date);
  return `${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}

/** "Wed 29 Oct 2026" */
export function longDayLabel(date: string): string {
  return `${dayLabel(date)} ${utc(date).getUTCFullYear()}`;
}

/** "27 Oct – 31 Oct 2026" (year shown once when both ends share it). */
export function rangeLabel(from: string, to: string): string {
  const a = utc(from);
  const b = utc(to);
  const short = (d: Date) => `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
  if (a.getUTCFullYear() === b.getUTCFullYear()) return `${short(a)} – ${short(b)} ${b.getUTCFullYear()}`;
  return `${short(a)} ${a.getUTCFullYear()} – ${short(b)} ${b.getUTCFullYear()}`;
}

export type RangePreset = 'THIS_WEEK' | 'LAST_7' | 'LAST_30';

export const RANGE_PRESET_LABEL: Record<RangePreset, string> = {
  THIS_WEEK: 'This week',
  LAST_7: 'Last 7 days',
  LAST_30: 'Last 30 days',
};

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

export const METHOD_FILTER_LABEL: Record<MethodFilter, string> = {
  ALL: 'All methods',
  MANUAL: 'Manual',
  AUTOMATIC: 'Automatic',
  ADMIN_CORRECTED: 'Admin corrected',
};

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
      outLabel = s.checkOutMethod ? METHOD_LABEL[s.checkOutMethod] : '';
    } else if (workDate === today) {
      status = s.corrected ? 'CORRECTED' : 'OPEN';
      outLabel = 'Not yet';
    } else {
      status = 'NEEDS_REVIEW';
      outLabel = outIssues.has(workDate) ? 'Unresolved' : 'Missing';
    }
    cards.push({
      key: s.id,
      workDate,
      dayLabel: dayLabel(workDate),
      status,
      inTime: formatBangkokTime(s.checkInAt),
      inLabel: METHOD_LABEL[s.checkInMethod],
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
      inLabel: 'Unresolved',
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
