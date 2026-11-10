import {
  type AttendanceActionResult,
  classify,
  decideManual,
  type LocationClass,
  NotificationEventType,
  RequestStatus,
  type UncertainReason,
} from '@attendance/shared';
import { errorMessage, isLocationError, type LocationFailureReason } from '../errors';
import type { AppDeps } from '../ports';
import {
  getConfigForVersion,
  getLocalView,
  logEvent,
  nowIso,
  recordNotificationEvent,
  saveEvidence,
  toEvidenceInput,
} from './common';
import { submitDecision } from './submitDecision';

export type ConfirmOutcome =
  /** Backend approved: the only outcome the UI may show as "Recorded". */
  | { kind: 'RECORDED'; result: AttendanceActionResult }
  /** Saved in the outbox; shown as "Pending synchronization". */
  | { kind: 'PENDING_SYNC' }
  /** Fresh fix not on the expected side (client check or 422 from the backend): show reason + Retry + correction. */
  | {
      kind: 'LOCATION_NOT_CONFIRMED';
      source: 'CLIENT' | 'SERVER';
      classification: LocationClass | null;
      distanceM: number | null;
      uncertainReason: UncertainReason | string | null;
    }
  | { kind: 'LOCATION_UNAVAILABLE'; reason: LocationFailureReason; message: string }
  /** The request was already finished (e.g. automatic attendance won the race — scenario 10). */
  | { kind: 'ALREADY_RESOLVED'; status: RequestStatus; result: AttendanceActionResult | null }
  | { kind: 'INVALID_STATE' }
  /** Backend answered REJECTED (e.g. MOCK_LOCATION, SESSION_ALREADY_OPEN). */
  | { kind: 'REJECTED'; reason: string | null; result: AttendanceActionResult }
  | { kind: 'ERROR'; code: string; message: string };

export interface ConfirmInput {
  requestId: string;
  /** When the user tapped Check In / Check Out (ISO). */
  userConfirmedAt: string;
  /** How the confirmation was triggered (for the notification-event log). */
  via?: 'NOTIFICATION' | 'DASHBOARD';
}

/** Manual Check In / Check Out (design §8.2 last paragraph, §9.1 "Staff taps Check In"). */
export async function confirmAttendance(deps: AppDeps, input: ConfirmInput): Promise<ConfirmOutcome> {
  const { requestId } = input;
  const req = await deps.store.getRequest(requestId);
  if (!req) return { kind: 'ERROR', code: 'NOT_FOUND', message: 'This attendance request no longer exists on this phone.' };
  if (req.localAction) return { kind: 'PENDING_SYNC' };

  await deps.store.updateRequest(requestId, { userConfirmedAt: input.userConfirmedAt, updatedAt: nowIso(deps) });
  if (input.via === 'NOTIFICATION') {
    await recordNotificationEvent(deps, {
      requestId,
      type: NotificationEventType.RESPONDED,
      occurredAt: input.userConfirmedAt,
      action: req.type,
    }).catch(() => undefined);
  }

  const view = await getLocalView(deps);
  const pre = decideManual({ request: req, hasOpenSession: view.hasOpenSession, locationClass: null });
  await logEvent(deps, 'MANUAL_DECISION', requestId, { stage: 'pre', decision: pre });
  if (pre.kind === 'REJECT') {
    if (pre.reason === 'REQUEST_NOT_ACTIVE') return { kind: 'ALREADY_RESOLVED', status: req.status, result: null };
    return { kind: 'INVALID_STATE' };
  }

  // Fresh fix in the foreground (Check In / Check Out opens the app — ADR-9).
  let reading;
  try {
    reading = await deps.location.getFreshLocation();
  } catch (e) {
    await logEvent(deps, 'LOCATION_UNAVAILABLE', requestId, { purpose: 'MANUAL', error: errorMessage(e) });
    return {
      kind: 'LOCATION_UNAVAILABLE',
      reason: isLocationError(e) ? e.reason : 'ERROR',
      message: errorMessage(e),
    };
  }

  const cfg = (await getConfigForVersion(deps, req.configVersion)) ?? (await deps.store.getLatestConfig());
  if (!cfg) return { kind: 'ERROR', code: 'NO_CONFIG', message: 'Geofence configuration is not available yet. Connect to the internet and retry.' };
  const cls = classify(reading, cfg, deps.clock.now());
  await saveEvidence(deps, requestId, 'MANUAL', reading, cls);

  const decision = decideManual({ request: req, hasOpenSession: view.hasOpenSession, locationClass: cls.classification });
  await logEvent(deps, 'MANUAL_DECISION', requestId, { stage: 'post', decision, classification: cls.classification });
  if (decision.kind === 'REJECT') {
    return {
      kind: 'LOCATION_NOT_CONFIRMED',
      source: 'CLIENT',
      classification: cls.classification,
      distanceM: cls.distanceM,
      uncertainReason: cls.uncertainReason,
    };
  }

  const out = await submitDecision(deps, requestId, {
    kind: 'CONFIRM',
    body: {
      userConfirmedAt: input.userConfirmedAt,
      clientRecordedAt: nowIso(deps),
      evidence: toEvidenceInput(reading, cls),
      device: deps.device(),
    },
  });

  if (out.kind === 'QUEUED') return { kind: 'PENDING_SYNC' };
  if (out.kind === 'API_ERROR') {
    const { error } = out;
    if (error.code === 'LOCATION_NOT_CONFIRMED') {
      const d = (error.details ?? {}) as { classification?: LocationClass; distanceM?: number; uncertainReason?: string };
      return {
        kind: 'LOCATION_NOT_CONFIRMED',
        source: 'SERVER',
        classification: d.classification ?? null,
        distanceM: d.distanceM ?? null,
        uncertainReason: d.uncertainReason ?? null,
      };
    }
    return { kind: 'ERROR', code: error.code, message: error.message };
  }

  const { result } = out;
  if (result.status === RequestStatus.APPROVED && result.requestId === requestId) {
    // Approved by *this* confirmation or an earlier one (idempotent replay); either way it is recorded.
    return { kind: 'RECORDED', result };
  }
  if (result.status === RequestStatus.REJECTED) return { kind: 'REJECTED', reason: result.reason, result };
  return { kind: 'ALREADY_RESOLVED', status: result.status, result };
}
