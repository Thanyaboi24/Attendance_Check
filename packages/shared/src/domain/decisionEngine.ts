import { GRACE_CLOCK_SKEW_SEC, LOCATION_POLICY } from '../constants';
import {
  AttendanceState,
  GeofenceTransition,
  LocationClass,
  NotificationStatus,
  RequestStatus,
  RequestType,
} from '../enums';

/**
 * One decision engine (design §7.7 / §8, ADR-8). Pure functions only: the mobile UI, the
 * headless background tasks and the NestJS backend all evaluate attendance with this code.
 */

export interface PendingRequestView {
  type: RequestType;
  status: RequestStatus;
  notificationStatus: NotificationStatus | null;
  notificationPostedAt: string | null;
  /** ISO-8601 end of the grace period. */
  deadlineAt: string;
}

/** The classification that confirms a request (Inside for check-in, Outside for check-out). */
export function expectedClassFor(type: RequestType): LocationClass {
  return type === RequestType.CHECK_IN ? LocationClass.CONFIRMED_INSIDE : LocationClass.CONFIRMED_OUTSIDE;
}

/** The classification that cancels a request (the user is confirmed on the opposite side). */
export function oppositeClassFor(type: RequestType): LocationClass {
  return type === RequestType.CHECK_IN ? LocationClass.CONFIRMED_OUTSIDE : LocationClass.CONFIRMED_INSIDE;
}

/** Derive the dashboard attendance state from backend facts (design §8.1). */
export function deriveAttendanceState(hasOpenSession: boolean, activeRequestType: RequestType | null): AttendanceState {
  if (activeRequestType === RequestType.CHECK_IN && !hasOpenSession) return AttendanceState.PENDING_CHECK_IN;
  if (activeRequestType === RequestType.CHECK_OUT && hasOpenSession) return AttendanceState.PENDING_CHECK_OUT;
  return hasOpenSession ? AttendanceState.CHECKED_IN : AttendanceState.CHECKED_OUT;
}

// ---------------------------------------------------------------------------
// Geofence transitions (design §7.2)
// ---------------------------------------------------------------------------

export type TransitionDecision =
  | { kind: 'CREATE_REQUEST'; type: RequestType }
  /** Opposite transition during a pending request: take a fresh fix and cancel if confirmed. */
  | { kind: 'REVALIDATE_PENDING' }
  | { kind: 'IGNORE'; reason: 'NO_STATE_CHANGE' };

export function decideOnTransition(state: AttendanceState, transition: GeofenceTransition): TransitionDecision {
  switch (state) {
    case AttendanceState.CHECKED_OUT:
      return transition === GeofenceTransition.ENTER
        ? { kind: 'CREATE_REQUEST', type: RequestType.CHECK_IN }
        : { kind: 'IGNORE', reason: 'NO_STATE_CHANGE' };
    case AttendanceState.CHECKED_IN:
      return transition === GeofenceTransition.EXIT
        ? { kind: 'CREATE_REQUEST', type: RequestType.CHECK_OUT }
        : { kind: 'IGNORE', reason: 'NO_STATE_CHANGE' };
    case AttendanceState.PENDING_CHECK_IN:
      return transition === GeofenceTransition.EXIT
        ? { kind: 'REVALIDATE_PENDING' }
        : { kind: 'IGNORE', reason: 'NO_STATE_CHANGE' };
    case AttendanceState.PENDING_CHECK_OUT:
      return transition === GeofenceTransition.ENTER
        ? { kind: 'REVALIDATE_PENDING' }
        : { kind: 'IGNORE', reason: 'NO_STATE_CHANGE' };
  }
}

/** After an opposite transition, a pending request is cancelled only when the fresh fix confirms the opposite side. */
export function decideRevalidation(type: RequestType, locationClass: LocationClass): 'CANCEL' | 'KEEP' {
  return locationClass === oppositeClassFor(type) ? 'CANCEL' : 'KEEP';
}

// ---------------------------------------------------------------------------
// Automatic attendance after the grace period (design §8.2, DS2 §2.7.3)
// ---------------------------------------------------------------------------

export type UnresolvedReason = 'UNCERTAIN_LOCATION' | 'NOTIFICATION_FAILED' | 'INVALID_STATE';

export type Decision =
  | { kind: 'WAIT' }
  /** Pre-conditions hold; a fresh location fix is required before deciding. */
  | { kind: 'NEED_LOCATION' }
  | { kind: 'RETRY_LOCATION'; delayMs: number }
  | { kind: 'SUBMIT_AUTO' }
  | { kind: 'CANCEL'; reason: 'CONFIRMED_OPPOSITE_SIDE' }
  | { kind: 'UNRESOLVED'; reason: UnresolvedReason }
  /** The request was already finished (e.g. confirmed manually); nothing to do. */
  | { kind: 'SKIP'; reason: 'REQUEST_NOT_ACTIVE' };

export interface AutoDecisionInput {
  request: PendingRequestView | null;
  hasOpenSession: boolean;
  /** Classification of a fresh reading, or null if no reading has been taken yet. */
  locationClass: LocationClass | null;
  now: Date;
  /** Number of location attempts already made for this evaluation (0 for the first). */
  attempt?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  /** Allowance for clock differences when checking the deadline (server side). */
  clockSkewSec?: number;
}

export function graceExpired(deadlineAt: string, now: Date, clockSkewSec = 0): boolean {
  return now.getTime() + clockSkewSec * 1000 >= Date.parse(deadlineAt);
}

function stateMatches(type: RequestType, hasOpenSession: boolean): boolean {
  // Check-in needs no open session (rule 5); check-out needs one (DS2 §2.9.3 rule 3).
  return type === RequestType.CHECK_IN ? !hasOpenSession : hasOpenSession;
}

export function decideAuto(input: AutoDecisionInput): Decision {
  const { request, hasOpenSession, locationClass, now } = input;
  const attempt = input.attempt ?? 0;
  const maxRetries = input.maxRetries ?? LOCATION_POLICY.uncertainRetryCount;
  const retryDelayMs = input.retryDelayMs ?? LOCATION_POLICY.uncertainRetryDelayMs;

  // 1. A valid pending request exists (4. no manual confirmation already finished it).
  if (!request || request.status !== RequestStatus.ACTIVE) return { kind: 'SKIP', reason: 'REQUEST_NOT_ACTIVE' };
  // 3. Grace period has expired.
  if (!graceExpired(request.deadlineAt, now, input.clockSkewSec ?? 0)) return { kind: 'WAIT' };
  // 2. The notification was posted; otherwise an ignored notification can never justify automation.
  if (request.notificationStatus !== NotificationStatus.POSTED || !request.notificationPostedAt) {
    return { kind: 'UNRESOLVED', reason: 'NOTIFICATION_FAILED' };
  }
  // 5. Session state is consistent with the request type.
  if (!stateMatches(request.type, hasOpenSession)) return { kind: 'UNRESOLVED', reason: 'INVALID_STATE' };
  // 6. Fresh reading.
  if (locationClass == null) return { kind: 'NEED_LOCATION' };
  if (locationClass === expectedClassFor(request.type)) return { kind: 'SUBMIT_AUTO' };
  if (locationClass === oppositeClassFor(request.type)) return { kind: 'CANCEL', reason: 'CONFIRMED_OPPOSITE_SIDE' };
  // UNCERTAIN: limited retries, then UNRESOLVED (conservative automation).
  if (attempt < maxRetries) return { kind: 'RETRY_LOCATION', delayMs: retryDelayMs };
  return { kind: 'UNRESOLVED', reason: 'UNCERTAIN_LOCATION' };
}

// ---------------------------------------------------------------------------
// Manual confirmation (design §8.2 last paragraph)
// ---------------------------------------------------------------------------

export type ManualDecision =
  | { kind: 'NEED_LOCATION' }
  | { kind: 'SUBMIT_MANUAL' }
  /** Not accepted; the app explains why and offers Retry or a correction request. */
  | { kind: 'REJECT'; reason: 'REQUEST_NOT_ACTIVE' | 'INVALID_STATE' | 'LOCATION_NOT_CONFIRMED' };

export interface ManualDecisionInput {
  request: Pick<PendingRequestView, 'type' | 'status'> | null;
  hasOpenSession: boolean;
  locationClass: LocationClass | null;
}

export function decideManual(input: ManualDecisionInput): ManualDecision {
  const { request, hasOpenSession, locationClass } = input;
  if (!request || request.status !== RequestStatus.ACTIVE) return { kind: 'REJECT', reason: 'REQUEST_NOT_ACTIVE' };
  if (!stateMatches(request.type, hasOpenSession)) return { kind: 'REJECT', reason: 'INVALID_STATE' };
  if (locationClass == null) return { kind: 'NEED_LOCATION' };
  if (locationClass === expectedClassFor(request.type)) return { kind: 'SUBMIT_MANUAL' };
  return { kind: 'REJECT', reason: 'LOCATION_NOT_CONFIRMED' };
}

/** Server-side default skew used when validating the grace period with client-anchored deadlines. */
export const SERVER_GRACE_SKEW_SEC = GRACE_CLOCK_SKEW_SEC;
