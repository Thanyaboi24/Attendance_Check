import {
  type AttendanceRequestDto,
  classify,
  decideOnTransition,
  decideRevalidation,
  type GeofenceConfig,
  type GeofenceTransition,
  type LocationClass,
  NotificationEventType,
  RequestStatus,
  type RequestType,
  SyncStatus,
} from '@attendance/shared';
import { errorMessage, isApiError } from '../errors';
import type { LocalRequest } from '../models';
import type { AppDeps } from '../ports';
import {
  applyRequestDto,
  changed,
  getActiveConfig,
  getConfigForVersion,
  getLocalView,
  logEvent,
  markRequestRefused,
  notificationStatusOf,
  nowIso,
  recordNotificationEvent,
  safe,
  saveEvidence,
  sendOrQueue,
  toEvidenceInput,
} from './common';
import { evaluateAutoAttendance } from './evaluateAutoAttendance';
import { submitDecision } from './submitDecision';

export interface TransitionInput {
  transition: GeofenceTransition;
  /** Region identifier from expo-location, e.g. `faculty-v3` (the config version that was registered). */
  regionId?: string | null;
  /** When the app received the event (ISO). */
  detectedAt: string;
}

export type TransitionOutcome =
  | { kind: 'IGNORED'; reason: 'SIGNED_OUT' | 'NO_CONFIG' | 'NO_STATE_CHANGE' }
  | {
      kind: 'REQUEST_CREATED';
      requestId: string;
      type: RequestType;
      notification: 'POSTED' | 'FAILED';
      sync: 'SYNCED' | 'PENDING_SYNC';
    }
  | { kind: 'REQUEST_REFUSED'; requestId: string; code: string }
  | { kind: 'PENDING_CANCELLED'; requestId: string; queued: boolean }
  | { kind: 'PENDING_KEPT'; requestId: string; classification: LocationClass | null };

/** Parses `faculty-v3` → 3. */
export function configVersionFromRegion(regionId: string | null | undefined): number | null {
  const m = /-v(\d+)$/.exec(regionId ?? '');
  return m ? Number(m[1]) : null;
}

export const regionIdFor = (cfg: Pick<GeofenceConfig, 'version'>) => `faculty-v${cfg.version}`;

/**
 * GEOFENCE_TASK use case (design §7.2). A transition is only a *trigger*:
 *   ENTER + CHECKED_OUT → CHECK_IN request;  EXIT + CHECKED_IN → CHECK_OUT request
 *   opposite transition while pending → fresh fix; cancel only when the opposite side is confirmed
 *   anything else → ignore (logged for evaluation)
 * New request: local row → notification (POSTED/FAILED) → POST /attendance/requests (or outbox) → schedule grace job.
 */
export async function handleGeofenceTransition(deps: AppDeps, input: TransitionInput): Promise<TransitionOutcome> {
  await logEvent(deps, 'GEOFENCE_TRANSITION', null, {
    transition: input.transition,
    regionId: input.regionId ?? null,
    geofenceDetectedAt: input.detectedAt,
  });

  if (!(await deps.session.getTokens())) {
    await logEvent(deps, 'TRANSITION_IGNORED', null, { reason: 'SIGNED_OUT' });
    return { kind: 'IGNORED', reason: 'SIGNED_OUT' };
  }

  let view = await getLocalView(deps);

  // A pending request whose grace job never ran (OEM killed WorkManager, reboot…) is evaluated first.
  if (view.activeRequest && Date.parse(view.activeRequest.deadlineAt) <= deps.clock.now().getTime()) {
    await evaluateAutoAttendance(deps, view.activeRequest.requestId);
    view = await getLocalView(deps);
  }

  const decision = decideOnTransition(view.state, input.transition);

  if (decision.kind === 'IGNORE') {
    await logEvent(deps, 'TRANSITION_IGNORED', view.activeRequest?.requestId ?? null, {
      reason: decision.reason,
      state: view.state,
      transition: input.transition,
    });
    return { kind: 'IGNORED', reason: 'NO_STATE_CHANGE' };
  }

  if (decision.kind === 'REVALIDATE_PENDING') {
    return revalidatePending(deps, view.activeRequest as LocalRequest);
  }

  // CREATE_REQUEST: use the version of the geofence that fired; fall back to the active cached config.
  const regionVersion = configVersionFromRegion(input.regionId);
  const cfg =
    (regionVersion != null ? await getConfigForVersion(deps, regionVersion) : null) ??
    (await getActiveConfig(deps, { refresh: false }));
  if (!cfg) {
    await logEvent(deps, 'TRANSITION_IGNORED', null, { reason: 'NO_CONFIG' });
    return { kind: 'IGNORED', reason: 'NO_CONFIG' };
  }

  const requestId = deps.uuid();
  const type = decision.type;
  const createdAt = nowIso(deps);
  const provisionalDeadline = new Date(Date.parse(input.detectedAt) + cfg.gracePeriodSec * 1000).toISOString();
  await deps.store.insertRequest({
    requestId,
    type,
    status: RequestStatus.ACTIVE,
    sessionId: null,
    configVersion: cfg.version,
    geofenceDetectedAt: input.detectedAt,
    notificationStatus: null,
    notificationPostedAt: null,
    deadlineAt: provisionalDeadline,
    method: null,
    syncStatus: SyncStatus.PENDING_SYNC,
    localAction: null,
    lastClassification: null,
    lastDistanceM: null,
    resolutionReason: null,
    officialTime: null,
    userConfirmedAt: null,
    lastError: null,
    createdAt,
    updatedAt: createdAt,
  });

  // Notification → POSTED / FAILED. FAILED means no automatic attendance for this request (DS2 §2.10.2).
  let present: Awaited<ReturnType<AppDeps['notifier']['presentAttendanceRequest']>>;
  try {
    present = await deps.notifier.presentAttendanceRequest({ requestId, type, graceSec: cfg.gracePeriodSec });
  } catch (e) {
    present = { status: 'FAILED', error: errorMessage(e) };
  }
  const notificationStatus = notificationStatusOf(present);
  const notificationPostedAt = present.status === 'POSTED' ? present.postedAt : null;
  const anchor = notificationPostedAt ?? input.detectedAt;
  const deadlineAt = new Date(Date.parse(anchor) + cfg.gracePeriodSec * 1000).toISOString();
  await deps.store.updateRequest(requestId, { notificationStatus, notificationPostedAt, deadlineAt, updatedAt: nowIso(deps) });
  await logEvent(deps, present.status === 'POSTED' ? 'NOTIFICATION_POSTED' : 'NOTIFICATION_FAILED', requestId, {
    notificationPostedAt,
    error: present.status === 'FAILED' ? present.error : null,
  });
  changed(deps);

  // POST /attendance/requests (idempotency key = requestId), or outbox when offline.
  let sync: 'SYNCED' | 'PENDING_SYNC' = 'PENDING_SYNC';
  try {
    const out = await sendOrQueue<AttendanceRequestDto>(deps, requestId, requestId, {
      kind: 'CREATE_REQUEST',
      body: {
        requestId,
        type,
        configVersion: cfg.version,
        geofenceDetectedAt: input.detectedAt,
        notificationStatus,
        notificationPostedAt,
        device: deps.device(),
      },
    });
    if (out.kind === 'SENT') {
      await applyRequestDto(deps, out.response);
      sync = 'SYNCED';
    }
  } catch (e) {
    if (isApiError(e)) {
      // 409 SESSION_ALREADY_OPEN / NO_OPEN_SESSION / ACTIVE_REQUEST_EXISTS, 404 CONFIG_VERSION_UNKNOWN…
      // The local view was stale: the backend is the source of truth.
      await markRequestRefused(deps, requestId, e);
      return { kind: 'REQUEST_REFUSED', requestId, code: e.code };
    }
    throw e;
  }

  await logEvent(deps, 'REQUEST_CREATED', requestId, {
    type,
    configVersion: cfg.version,
    geofenceDetectedAt: input.detectedAt,
    notificationStatus,
    notificationPostedAt,
    sync,
  });

  await recordNotificationEvent(deps, {
    requestId,
    type: present.status === 'POSTED' ? NotificationEventType.POSTED : NotificationEventType.FAILED,
    occurredAt: notificationPostedAt ?? nowIso(deps),
    detail: present.status === 'FAILED' ? present.error.slice(0, 500) : null,
  }).catch(() => undefined);

  // Grace job (WorkManager). Scheduled even when the notification failed: the job then records UNRESOLVED.
  const stored = await deps.store.getRequest(requestId);
  const delayMs = Math.max(0, Date.parse(stored?.deadlineAt ?? deadlineAt) - deps.clock.now().getTime());
  await safe(() => deps.scheduler.schedule(requestId, delayMs));
  changed(deps);

  return { kind: 'REQUEST_CREATED', requestId, type, notification: present.status, sync };
}

/** Opposite transition during a pending request: cancel only with a fresh *confirmed* opposite-side fix. */
async function revalidatePending(deps: AppDeps, req: LocalRequest): Promise<TransitionOutcome> {
  const cfg = (await getConfigForVersion(deps, req.configVersion)) ?? (await deps.store.getLatestConfig());
  let reading;
  try {
    reading = await deps.location.getFreshLocation();
  } catch (e) {
    await logEvent(deps, 'LOCATION_UNAVAILABLE', req.requestId, { purpose: 'REVALIDATE', error: errorMessage(e) });
    return { kind: 'PENDING_KEPT', requestId: req.requestId, classification: null };
  }
  if (!cfg) return { kind: 'PENDING_KEPT', requestId: req.requestId, classification: null };

  const cls = classify(reading, cfg, deps.clock.now());
  await saveEvidence(deps, req.requestId, 'REVALIDATE', reading, cls);
  const verdict = decideRevalidation(req.type, cls.classification);
  await logEvent(deps, 'REVALIDATION', req.requestId, { verdict, classification: cls.classification });
  if (verdict === 'KEEP') return { kind: 'PENDING_KEPT', requestId: req.requestId, classification: cls.classification };

  const out = await submitDecision(deps, req.requestId, {
    kind: 'CANCEL',
    body: { reason: 'CONFIRMED_OPPOSITE_SIDE', clientRecordedAt: nowIso(deps), evidence: toEvidenceInput(reading, cls) },
  });
  if (out.kind === 'API_ERROR') {
    // 422: the backend could not confirm the opposite side; the request stays pending and the grace job decides.
    return { kind: 'PENDING_KEPT', requestId: req.requestId, classification: cls.classification };
  }
  await safe(() => deps.scheduler.cancel(req.requestId));
  await safe(() => deps.notifier.dismissAttendanceRequest(req.requestId));
  return { kind: 'PENDING_CANCELLED', requestId: req.requestId, queued: out.kind === 'QUEUED' };
}
