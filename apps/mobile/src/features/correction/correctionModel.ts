import { bangkokLocalToIso } from '@attendance/shared';

/** "What needs fixing?" (mockup page 7). */
export type FixKind = 'CHECK_IN' | 'CHECK_OUT' | 'WHOLE_DAY';

export interface SessionSummary {
  checkInAt: string | null;
  checkOutAt: string | null;
}

/** Option labels depend on what the record already has ("Missing check-out" vs "Check-out time"). */
export function fixOptions(s: SessionSummary | null): Array<{ kind: FixKind; label: string }> {
  return [
    { kind: 'CHECK_IN', label: s?.checkInAt ? 'Check-in time' : 'Missing check-in' },
    { kind: 'CHECK_OUT', label: s?.checkOutAt || !s?.checkInAt ? 'Check-out time' : 'Missing check-out' },
    { kind: 'WHOLE_DAY', label: 'Missing whole day' },
  ];
}

/** Most likely fix: a session without a check-out → check-out; no session → whole day. */
export function defaultFix(s: SessionSummary | null): FixKind {
  if (!s?.checkInAt) return 'WHOLE_DAY';
  if (!s.checkOutAt) return 'CHECK_OUT';
  return 'CHECK_IN';
}

export const needsCheckIn = (k: FixKind) => k !== 'CHECK_OUT';
export const needsCheckOut = (k: FixKind) => k !== 'CHECK_IN';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "17:05" → "05:05 PM" (the picker field, page 7). */
export function to12h(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
}

export type CorrectionTimes =
  | { ok: true; requestedCheckInAt: string | null; requestedCheckOutAt: string | null }
  | { ok: false; message: string };

/** Bangkok wall-clock times for the work date → the ISO instants POST /corrections expects. */
export function correctionTimes(kind: FixKind, workDate: string, checkIn: string, checkOut: string): CorrectionTimes {
  const wantIn = needsCheckIn(kind);
  const wantOut = needsCheckOut(kind);
  if (wantIn && !TIME_RE.test(checkIn)) return { ok: false, message: 'Choose the correct check-in time.' };
  if (wantOut && !TIME_RE.test(checkOut)) return { ok: false, message: 'Choose the correct check-out time.' };
  if (wantIn && wantOut && checkOut < checkIn) return { ok: false, message: 'Check-out cannot be before check-in.' };
  return {
    ok: true,
    requestedCheckInAt: wantIn ? bangkokLocalToIso(workDate, checkIn) : null,
    requestedCheckOutAt: wantOut ? bangkokLocalToIso(workDate, checkOut) : null,
  };
}
