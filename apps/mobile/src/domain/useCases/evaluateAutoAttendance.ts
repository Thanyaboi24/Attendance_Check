import {
  type AttendanceActionResult,
  type Classification,
  classify,
  decideAuto,
  type Decision,
  formatBangkokTime,
  type GeofenceConfig,
  LOCATION_POLICY,
  LocationClass,
  type LocationReading,
  RequestStatus,
  RequestType,
  type UnresolvedReasonInput,
} from '@attendance/shared';
import { errorMessage, isLocationError } from '../errors';
import type { AppDeps } from '../ports';
import {
  getConfigForVersion,
  getLocalView,
  logEvent,
  nowIso,
  refreshState,
  safe,
  saveEvidence,
  toEvidenceInput,
  toPendingView,
} from './common';
import { type DecisionOutcome, submitDecision } from './submitDecision';

export type AutoOutcome =
  | { kind: 'SKIPPED'; reason: 'NOT_FOUND' | 'REQUEST_NOT_ACTIVE' | 'PENDING_SYNC' }
  | { kind: 'WAITING'; rescheduledInMs: number }
  | {
      kind: 'SUBMITTED';
      action: 'AUTO' | 'CANCEL' | 'UNRESOLVED';
      reason?: UnresolvedReasonInput;
      /** Backend answer, or null when the decision was queued in the outbox (offline). */
      result: AttendanceActionResult | null;
      queued: boolean;
      locationAttempts: number;
    }
  | { kind: 'ERROR'; code: string };

/** Delay before re-trying when the backend says the grace period has not expired yet (clock skew). */
const GRACE_NOT_EXPIRED_RETRY_MS = 45_000;

/**
 * GracePeriodTask (design §7.6, §9.1 "No response"): decideAuto loop with a *fresh* fix.
 *
 * - The timer is never assumed to be exact: whatever the delay, a new fix is taken (DS2 §2.10.3).
 * - UNCERTAIN → limited retries (LOCATION_POLICY), then UNRESOLVED (conservative automation).
 * - Notification never posted → UNRESOLVED / NOTIFICATION_FAILED, never automatic attendance.
 * - The request's original config version is used for classification.
 */
export async function evaluateAutoAttendance(deps: AppDeps, requestId: string): Promise<AutoOutcome> {
  const initial = await deps.store.getRequest(requestId);
  await logEvent(deps, 'GRACE_TASK_STARTED', requestId, { found: initial != null });
  if (!initial) return { kind: 'SKIPPED', reason: 'NOT_FOUND' };
  if (initial.localAction) return { kind: 'SKIPPED', reason: 'PENDING_SYNC' };
  if (initial.status !== RequestStatus.ACTIVE) return { kind: 'SKIPPED', reason: 'REQUEST_NOT_ACTIVE' };

  // Best effort: the latest session state from the backend (offline → cached snapshot).
  await refreshState(deps);

  let cfg: GeofenceConfig | null = await getConfigForVersion(deps, initial.configVersion);
  if (!cfg) {
    cfg = await deps.store.getLatestConfig();
    await logEvent(deps, 'CONFIG_FALLBACK', requestId, {
      wanted: initial.configVersion,
      used: cfg?.version ?? null,
    });
  }

  let attempt = 0;
  let lastReading: LocationReading | null = null;
  let lastClass: Classification | null = null;

  for (;;) {
    const req = await deps.store.getRequest(requestId);
    if (!req) return { kind: 'SKIPPED', reason: 'NOT_FOUND' };
    if (req.localAction) return { kind: 'SKIPPED', reason: 'PENDING_SYNC' };
    const view = await getLocalView(deps);
    const base = {
      request: toPendingView(req),
      hasOpenSession: view.hasOpenSession,
      now: deps.clock.now(),
    };

    const pre = decideAuto({ ...base, locationClass: null, attempt });
    await logEvent(deps, 'AUTO_DECISION', requestId, { stage: 'pre', decision: pre, attempt });
    switch (pre.kind) {
      case 'SKIP':
        return { kind: 'SKIPPED', reason: 'REQUEST_NOT_ACTIVE' };
      case 'WAIT': {
        const ms = Math.max(1_000, Date.parse(req.deadlineAt) - base.now.getTime());
        await deps.scheduler.schedule(requestId, ms);
        return { kind: 'WAITING', rescheduledInMs: ms };
      }
      case 'UNRESOLVED':
        return finish(deps, requestId, 'UNRESOLVED', unresolvedBody(deps, pre.reason, lastReading, lastClass), attempt, pre.reason);
      case 'NEED_LOCATION':
        break;
      default:
        // decideAuto never returns other kinds without a location class.
        return { kind: 'ERROR', code: `UNEXPECTED_${pre.kind}` };
    }

    // Fresh fix (Highest accuracy, ~20 s timeout inside the provider).
    let reading: LocationReading | null = null;
    try {
      reading = await deps.location.getFreshLocation();
    } catch (e) {
      await logEvent(deps, 'LOCATION_UNAVAILABLE', requestId, {
        reason: isLocationError(e) ? e.reason : 'ERROR',
        error: errorMessage(e),
        attempt,
      });
    }
    let cls: Classification | null = null;
    if (reading && cfg) {
      cls = classify(reading, cfg, deps.clock.now());
      await saveEvidence(deps, requestId, 'AUTO', reading, cls);
      lastReading = reading;
      lastClass = cls;
    }

    const decision: Decision = decideAuto({
      ...base,
      now: deps.clock.now(),
      // No fix (timeout, services off) counts as UNCERTAIN: retry, then UNRESOLVED.
      locationClass: cls?.classification ?? LocationClass.UNCERTAIN,
      attempt,
    });
    attempt += 1;
    await logEvent(deps, 'AUTO_DECISION', requestId, { stage: 'post', decision, attempt, classification: cls?.classification ?? null });

    switch (decision.kind) {
      case 'SUBMIT_AUTO': {
        const r = reading as LocationReading;
        return finish(
          deps,
          requestId,
          'AUTO',
          {
            kind: 'AUTO',
            body: {
              notificationPostedAt: req.notificationPostedAt as string,
              clientRecordedAt: nowIso(deps),
              evidence: toEvidenceInput(r, cls),
              locationAttempts: attempt,
              device: deps.device(),
            },
          },
          attempt,
        );
      }
      case 'CANCEL': {
        const r = reading as LocationReading;
        return finish(
          deps,
          requestId,
          'CANCEL',
          {
            kind: 'CANCEL',
            body: { reason: 'CONFIRMED_OPPOSITE_SIDE', clientRecordedAt: nowIso(deps), evidence: toEvidenceInput(r, cls) },
          },
          attempt,
        );
      }
      case 'RETRY_LOCATION':
        await deps.sleep(decision.delayMs ?? LOCATION_POLICY.uncertainRetryDelayMs);
        continue;
      case 'UNRESOLVED': {
        const reason: UnresolvedReasonInput =
          decision.reason === 'UNCERTAIN_LOCATION' && lastReading == null ? 'LOCATION_UNAVAILABLE' : decision.reason;
        return finish(deps, requestId, 'UNRESOLVED', unresolvedBody(deps, reason, lastReading, lastClass), attempt, reason);
      }
      case 'SKIP':
        return { kind: 'SKIPPED', reason: 'REQUEST_NOT_ACTIVE' };
      case 'WAIT':
      case 'NEED_LOCATION':
        return { kind: 'ERROR', code: `UNEXPECTED_${decision.kind}` };
    }
  }
}

function unresolvedBody(
  deps: AppDeps,
  reason: UnresolvedReasonInput,
  reading: LocationReading | null,
  cls: Classification | null,
) {
  return {
    kind: 'UNRESOLVED' as const,
    body: {
      reason,
      clientRecordedAt: nowIso(deps),
      evidence: reading ? toEvidenceInput(reading, cls) : null,
    },
  };
}

async function finish(
  deps: AppDeps,
  requestId: string,
  action: 'AUTO' | 'CANCEL' | 'UNRESOLVED',
  payload: Parameters<typeof submitDecision>[2],
  attempts: number,
  reason?: UnresolvedReasonInput,
): Promise<AutoOutcome> {
  const out: DecisionOutcome = await submitDecision(deps, requestId, payload);
  if (out.kind === 'API_ERROR') {
    const { error } = out;
    if (action === 'AUTO' && error.code === 'GRACE_PERIOD_NOT_EXPIRED') {
      await deps.scheduler.schedule(requestId, GRACE_NOT_EXPIRED_RETRY_MS);
      return { kind: 'WAITING', rescheduledInMs: GRACE_NOT_EXPIRED_RETRY_MS };
    }
    if (action === 'CANCEL' && error.code === 'LOCATION_NOT_CONFIRMED') {
      // The backend (server receive time, same config version) could not confirm the opposite side.
      const req = await deps.store.getRequest(requestId);
      const evidence = req ? await lastEvidenceInput(deps, requestId) : null;
      return finish(
        deps,
        requestId,
        'UNRESOLVED',
        { kind: 'UNRESOLVED', body: { reason: 'UNCERTAIN_LOCATION', clientRecordedAt: nowIso(deps), evidence } },
        attempts,
        'UNCERTAIN_LOCATION',
      );
    }
    return { kind: 'ERROR', code: error.code };
  }

  const result = out.kind === 'RESULT' ? out.result : null;
  await notifyOutcome(deps, requestId, action, result, out.kind === 'QUEUED', reason);
  return { kind: 'SUBMITTED', action, reason, result, queued: out.kind === 'QUEUED', locationAttempts: attempts };
}

async function lastEvidenceInput(deps: AppDeps, requestId: string) {
  const list = await deps.store.listEvidence(requestId);
  const e = list[list.length - 1];
  if (!e) return null;
  return {
    lat: e.lat,
    lng: e.lng,
    measuredAt: e.measuredAt,
    accuracyM: e.accuracyM,
    isMock: e.isMock,
    clientDistanceM: e.distanceM,
    clientClassification: e.classification,
  };
}

/** Tells the user what happened in the background. Never claims "recorded" for a queued decision. */
async function notifyOutcome(
  deps: AppDeps,
  requestId: string,
  action: 'AUTO' | 'CANCEL' | 'UNRESOLVED',
  result: AttendanceActionResult | null,
  queued: boolean,
  reason?: UnresolvedReasonInput,
): Promise<void> {
  const req = await deps.store.getRequest(requestId);
  const what = req?.type === RequestType.CHECK_OUT ? 'check-out' : 'check-in';
  let title: string;
  let body: string;
  if (queued) {
    title = 'Pending synchronization';
    body = `Your automatic ${what} decision is saved on this phone and will be sent when the connection returns. It is not recorded yet.`;
  } else if (result?.status === RequestStatus.APPROVED) {
    title = `Automatic ${what} recorded`;
    body = `Recorded at ${result.officialTime ? formatBangkokTime(result.officialTime) : '—'} (Bangkok time) after verifying your location again.`;
  } else if (result?.status === RequestStatus.CANCELLED || action === 'CANCEL') {
    title = `No ${what}`;
    body = `Your location was confirmed on the other side of the attendance area, so no ${what} was recorded.`;
  } else if (result?.status === RequestStatus.REJECTED) {
    title = `${capitalise(what)} not recorded`;
    body = `The server rejected the request (${result.reason ?? 'rejected'}). You can submit a correction request.`;
  } else {
    title = `${capitalise(what)} unresolved`;
    body =
      (result?.reason ?? reason) === 'NOTIFICATION_FAILED'
        ? 'The confirmation notification could not be shown, so no automatic attendance was recorded. Open the app to check in/out manually.'
        : 'Your location could not be verified, so nothing was recorded. Open the app to retry or submit a correction request.';
  }
  await safe(() => deps.notifier.showInfo({ title, body, requestId }));
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
