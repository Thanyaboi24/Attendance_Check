import { describe, expect, it } from 'vitest';
import {
  decideAuto,
  decideManual,
  decideOnTransition,
  decideRevalidation,
  deriveAttendanceState,
  type PendingRequestView,
} from '../src/domain/decisionEngine';
import {
  AttendanceState,
  GeofenceTransition,
  LocationClass,
  NotificationStatus,
  RequestStatus,
  RequestType,
} from '../src/enums';

const deadline = '2026-11-01T01:33:05Z';
const before = new Date('2026-11-01T01:31:00Z');
const after = new Date('2026-11-01T01:33:30Z');

function req(type: RequestType, overrides: Partial<PendingRequestView> = {}): PendingRequestView {
  return {
    type,
    status: RequestStatus.ACTIVE,
    notificationStatus: NotificationStatus.POSTED,
    notificationPostedAt: '2026-11-01T01:28:05Z',
    deadlineAt: deadline,
    ...overrides,
  };
}

const { CONFIRMED_INSIDE: IN, CONFIRMED_OUTSIDE: OUT, UNCERTAIN } = LocationClass;

describe('deriveAttendanceState', () => {
  it.each([
    [false, null, AttendanceState.CHECKED_OUT],
    [true, null, AttendanceState.CHECKED_IN],
    [false, RequestType.CHECK_IN, AttendanceState.PENDING_CHECK_IN],
    [true, RequestType.CHECK_OUT, AttendanceState.PENDING_CHECK_OUT],
    // inconsistent combinations fall back to the session fact
    [true, RequestType.CHECK_IN, AttendanceState.CHECKED_IN],
    [false, RequestType.CHECK_OUT, AttendanceState.CHECKED_OUT],
  ] as const)('open=%s request=%s -> %s', (open, type, expected) => {
    expect(deriveAttendanceState(open, type)).toBe(expected);
  });
});

describe('decideOnTransition (design §7.2)', () => {
  it('ENTER while checked out creates a CHECK_IN request', () => {
    expect(decideOnTransition(AttendanceState.CHECKED_OUT, GeofenceTransition.ENTER)).toEqual({
      kind: 'CREATE_REQUEST',
      type: RequestType.CHECK_IN,
    });
  });
  it('EXIT while checked in creates a CHECK_OUT request', () => {
    expect(decideOnTransition(AttendanceState.CHECKED_IN, GeofenceTransition.EXIT)).toEqual({
      kind: 'CREATE_REQUEST',
      type: RequestType.CHECK_OUT,
    });
  });
  it('opposite transitions during a pending request trigger revalidation', () => {
    expect(decideOnTransition(AttendanceState.PENDING_CHECK_IN, GeofenceTransition.EXIT).kind).toBe('REVALIDATE_PENDING');
    expect(decideOnTransition(AttendanceState.PENDING_CHECK_OUT, GeofenceTransition.ENTER).kind).toBe('REVALIDATE_PENDING');
  });
  it('everything else is ignored', () => {
    expect(decideOnTransition(AttendanceState.CHECKED_OUT, GeofenceTransition.EXIT).kind).toBe('IGNORE');
    expect(decideOnTransition(AttendanceState.CHECKED_IN, GeofenceTransition.ENTER).kind).toBe('IGNORE');
    expect(decideOnTransition(AttendanceState.PENDING_CHECK_IN, GeofenceTransition.ENTER).kind).toBe('IGNORE');
    expect(decideOnTransition(AttendanceState.PENDING_CHECK_OUT, GeofenceTransition.EXIT).kind).toBe('IGNORE');
  });
});

describe('decideRevalidation (scenarios 3 and 6)', () => {
  it('scenario 3: confirmed exit before timeout cancels a pending check-in', () => {
    expect(decideRevalidation(RequestType.CHECK_IN, OUT)).toBe('CANCEL');
  });
  it('scenario 6: confirmed return before timeout cancels a pending check-out', () => {
    expect(decideRevalidation(RequestType.CHECK_OUT, IN)).toBe('CANCEL');
  });
  it('an uncertain or same-side fix keeps the request', () => {
    expect(decideRevalidation(RequestType.CHECK_IN, UNCERTAIN)).toBe('KEEP');
    expect(decideRevalidation(RequestType.CHECK_IN, IN)).toBe('KEEP');
    expect(decideRevalidation(RequestType.CHECK_OUT, OUT)).toBe('KEEP');
  });
});

describe('decideAuto (design §8.2)', () => {
  it('waits while the grace period is running', () => {
    expect(decideAuto({ request: req('CHECK_IN'), hasOpenSession: false, locationClass: IN, now: before })).toEqual({
      kind: 'WAIT',
    });
  });

  it('asks for a fresh fix once all pre-conditions hold', () => {
    expect(decideAuto({ request: req('CHECK_IN'), hasOpenSession: false, locationClass: null, now: after })).toEqual({
      kind: 'NEED_LOCATION',
    });
  });

  it('scenario 2: timeout + confirmed inside -> automatic check-in', () => {
    expect(decideAuto({ request: req('CHECK_IN'), hasOpenSession: false, locationClass: IN, now: after }).kind).toBe(
      'SUBMIT_AUTO',
    );
  });

  it('scenario 5: timeout + confirmed outside -> automatic check-out', () => {
    expect(decideAuto({ request: req('CHECK_OUT'), hasOpenSession: true, locationClass: OUT, now: after }).kind).toBe(
      'SUBMIT_AUTO',
    );
  });

  it('timeout + confirmed on the opposite side -> cancel', () => {
    expect(decideAuto({ request: req('CHECK_IN'), hasOpenSession: false, locationClass: OUT, now: after })).toEqual({
      kind: 'CANCEL',
      reason: 'CONFIRMED_OPPOSITE_SIDE',
    });
  });

  it('scenario 7: uncertain fix retries a limited number of times, then UNRESOLVED', () => {
    const base = { request: req('CHECK_IN'), hasOpenSession: false, locationClass: UNCERTAIN, now: after };
    expect(decideAuto({ ...base, attempt: 0 }).kind).toBe('RETRY_LOCATION');
    expect(decideAuto({ ...base, attempt: 1 }).kind).toBe('RETRY_LOCATION');
    expect(decideAuto({ ...base, attempt: 2 })).toEqual({ kind: 'UNRESOLVED', reason: 'UNCERTAIN_LOCATION' });
    expect(decideAuto({ ...base, attempt: 0, maxRetries: 0 })).toEqual({
      kind: 'UNRESOLVED',
      reason: 'UNCERTAIN_LOCATION',
    });
  });

  it('scenario 13: notification failure blocks automatic attendance', () => {
    const failed = req('CHECK_IN', { notificationStatus: NotificationStatus.FAILED, notificationPostedAt: null });
    expect(decideAuto({ request: failed, hasOpenSession: false, locationClass: IN, now: after })).toEqual({
      kind: 'UNRESOLVED',
      reason: 'NOTIFICATION_FAILED',
    });
    const missingTime = req('CHECK_IN', { notificationPostedAt: null });
    expect(decideAuto({ request: missingTime, hasOpenSession: false, locationClass: IN, now: after }).kind).toBe(
      'UNRESOLVED',
    );
  });

  it('auto check-in with an open session or auto check-out without one is invalid state', () => {
    expect(decideAuto({ request: req('CHECK_IN'), hasOpenSession: true, locationClass: IN, now: after })).toEqual({
      kind: 'UNRESOLVED',
      reason: 'INVALID_STATE',
    });
    expect(decideAuto({ request: req('CHECK_OUT'), hasOpenSession: false, locationClass: OUT, now: after })).toEqual({
      kind: 'UNRESOLVED',
      reason: 'INVALID_STATE',
    });
  });

  it('a request already finished (e.g. manual confirmation won) is skipped', () => {
    const done = req('CHECK_IN', { status: RequestStatus.APPROVED });
    expect(decideAuto({ request: done, hasOpenSession: true, locationClass: IN, now: after }).kind).toBe('SKIP');
    expect(decideAuto({ request: null, hasOpenSession: false, locationClass: IN, now: after }).kind).toBe('SKIP');
  });

  it('clock skew allowance lets the server accept a deadline a few seconds early', () => {
    const almost = new Date(Date.parse(deadline) - 10_000);
    expect(decideAuto({ request: req('CHECK_IN'), hasOpenSession: false, locationClass: IN, now: almost }).kind).toBe(
      'WAIT',
    );
    expect(
      decideAuto({ request: req('CHECK_IN'), hasOpenSession: false, locationClass: IN, now: almost, clockSkewSec: 30 })
        .kind,
    ).toBe('SUBMIT_AUTO');
  });
});

describe('decideManual', () => {
  it('scenario 1: manual check-in with confirmed inside is submitted', () => {
    expect(decideManual({ request: req('CHECK_IN'), hasOpenSession: false, locationClass: IN }).kind).toBe(
      'SUBMIT_MANUAL',
    );
  });
  it('scenario 4: manual check-out with confirmed outside is submitted', () => {
    expect(decideManual({ request: req('CHECK_OUT'), hasOpenSession: true, locationClass: OUT }).kind).toBe(
      'SUBMIT_MANUAL',
    );
  });
  it('manual confirmation still requires a confirming fresh fix', () => {
    expect(decideManual({ request: req('CHECK_IN'), hasOpenSession: false, locationClass: UNCERTAIN })).toEqual({
      kind: 'REJECT',
      reason: 'LOCATION_NOT_CONFIRMED',
    });
    expect(decideManual({ request: req('CHECK_OUT'), hasOpenSession: true, locationClass: IN }).kind).toBe('REJECT');
  });
  it('scenario 11: check-out without an open session is rejected', () => {
    expect(decideManual({ request: req('CHECK_OUT'), hasOpenSession: false, locationClass: OUT })).toEqual({
      kind: 'REJECT',
      reason: 'INVALID_STATE',
    });
  });
  it('needs a location before deciding', () => {
    expect(decideManual({ request: req('CHECK_IN'), hasOpenSession: false, locationClass: null }).kind).toBe(
      'NEED_LOCATION',
    );
  });
  it('rejects requests that are no longer active', () => {
    const cancelled = req('CHECK_IN', { status: RequestStatus.CANCELLED });
    expect(decideManual({ request: cancelled, hasOpenSession: false, locationClass: IN }).kind).toBe('REJECT');
  });
});
