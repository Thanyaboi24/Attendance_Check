import {
  type AttendanceActionResult,
  type AttendanceRequestDto,
  AttendanceState,
  type AttendanceStateResponse,
  type AutoAttendance,
  type CancelAttendance,
  type Classification,
  type ConfirmAttendance,
  type CreateAttendanceRequest,
  type CreateCorrection,
  deriveAttendanceState,
  type EvidenceInput,
  type GeofenceConfig,
  type LocationReading,
  Method,
  type NotificationEventInput,
  NotificationStatus,
  type PendingRequestView,
  RequestStatus,
  RequestType,
  type SessionDto,
  SessionStatus,
  SyncStatus,
  type UnresolvedAttendance,
} from '@attendance/shared';
import { ApiRequestError, errorMessage, isApiError, isRetryable } from '../errors';
import type { EventType, EvidencePurpose, LocalActionKind, LocalRequest, OutboxEntry, OutboxKind, StateSnapshot } from '../models';
import type { AppDeps, AttendanceApi } from '../ports';

export const META_ACTIVE_CONFIG_VERSION = 'activeConfigVersion';
export const META_REGISTERED_CONFIG_VERSION = 'registeredConfigVersion';
export const META_USER_ID = 'userId';
export const META_ONBOARDED = 'onboarded';

export const nowIso = (deps: Pick<AppDeps, 'clock'>): string => deps.clock.now().toISOString();

export async function logEvent(
  deps: Pick<AppDeps, 'store' | 'clock'>,
  type: EventType,
  requestId: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    await deps.store.logEvent(type, requestId, detail, nowIso(deps));
  } catch {
    // The evaluation log must never break attendance processing.
  }
}

export function changed(deps: Pick<AppDeps, 'onLocalChange'>): void {
  try {
    deps.onLocalChange?.();
  } catch {
    /* UI listener errors are not our concern here */
  }
}

// ---------------------------------------------------------------------------
// Local attendance view
// ---------------------------------------------------------------------------

export interface LocalView {
  snapshot: StateSnapshot | null;
  /** Open session as far as the app can tell (server snapshot + decisions waiting for synchronisation). */
  hasOpenSession: boolean;
  activeRequest: LocalRequest | null;
  state: AttendanceState;
}

/**
 * Derives the attendance state used by the decision engine. Requests whose decision is queued in the outbox
 * (CONFIRM/AUTO) are treated optimistically for *decisions* only, so a later transition is evaluated against
 * the most likely state. The UI still shows them as "Pending synchronization".
 */
export async function getLocalView(deps: Pick<AppDeps, 'store'>): Promise<LocalView> {
  const snapshot = await deps.store.getSnapshot();
  let hasOpenSession = snapshot?.openSession != null;
  for (const r of await deps.store.listOpenRequests()) {
    if (r.localAction === 'CONFIRM' || r.localAction === 'AUTO') hasOpenSession = r.type === RequestType.CHECK_IN;
  }
  const activeRequest = await deps.store.getActiveRequest();
  return {
    snapshot,
    hasOpenSession,
    activeRequest,
    state: deriveAttendanceState(hasOpenSession, activeRequest?.type ?? null),
  };
}

export function toPendingView(r: LocalRequest): PendingRequestView {
  return {
    type: r.type,
    // A request whose decision is already queued is no longer "valid pending" for automation.
    status: r.localAction ? RequestStatus.APPROVED : r.status,
    notificationStatus: r.notificationStatus,
    notificationPostedAt: r.notificationPostedAt,
    deadlineAt: r.deadlineAt,
  };
}

// ---------------------------------------------------------------------------
// Configuration (pending requests keep their version — DS2 §2.9.5)
// ---------------------------------------------------------------------------

export async function getConfigForVersion(
  deps: Pick<AppDeps, 'store' | 'api' | 'clock'>,
  version: number,
): Promise<GeofenceConfig | null> {
  const cached = await deps.store.getConfig(version);
  if (cached) return cached;
  try {
    const cfg = await deps.api.getConfig(version);
    await deps.store.saveConfig(cfg);
    await logEvent(deps, 'CONFIG_FETCHED', null, { version: cfg.version, reason: 'pending-request' });
    return cfg;
  } catch (e) {
    await logEvent(deps, 'CONFIG_FALLBACK', null, { version, error: errorMessage(e) });
    return null;
  }
}

/** Active config: refreshed from the backend when possible, otherwise the cached one. */
export async function getActiveConfig(
  deps: Pick<AppDeps, 'store' | 'api' | 'clock'>,
  opts: { refresh: boolean },
): Promise<GeofenceConfig | null> {
  if (opts.refresh) {
    try {
      const cfg = await deps.api.getActiveConfig();
      await deps.store.saveConfig(cfg);
      await deps.store.setMeta(META_ACTIVE_CONFIG_VERSION, String(cfg.version));
      return cfg;
    } catch {
      /* fall through to cache */
    }
  }
  const v = await deps.store.getMeta(META_ACTIVE_CONFIG_VERSION);
  const byVersion = v ? await deps.store.getConfig(Number(v)) : null;
  return byVersion ?? (await deps.store.getLatestConfig());
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export function toEvidenceInput(reading: LocationReading, c: Classification | null): EvidenceInput {
  return {
    lat: reading.lat,
    lng: reading.lng,
    measuredAt: reading.measuredAt,
    accuracyM: reading.accuracyM,
    isMock: reading.isMock ?? false,
    clientDistanceM: c?.distanceM ?? null,
    clientClassification: c?.classification ?? null,
  };
}

export async function saveEvidence(
  deps: Pick<AppDeps, 'store' | 'clock' | 'uuid'>,
  requestId: string | null,
  purpose: EvidencePurpose,
  reading: LocationReading,
  c: Classification,
): Promise<void> {
  await deps.store.insertEvidence({
    evidenceId: deps.uuid(),
    requestId,
    purpose,
    lat: reading.lat,
    lng: reading.lng,
    measuredAt: reading.measuredAt,
    accuracyM: reading.accuracyM,
    distanceM: c.distanceM,
    classification: c.classification,
    uncertainReason: c.uncertainReason,
    isMock: reading.isMock ?? false,
    createdAt: nowIso(deps),
  });
  if (requestId) {
    await deps.store.updateRequest(requestId, {
      lastClassification: c.classification,
      lastDistanceM: c.distanceM,
      updatedAt: nowIso(deps),
    });
  }
  await logEvent(deps, 'LOCATION_FIX', requestId, {
    purpose,
    measuredAt: reading.measuredAt,
    accuracyM: reading.accuracyM,
    distanceM: c.distanceM,
    classification: c.classification,
    uncertainReason: c.uncertainReason,
    isMock: reading.isMock ?? false,
  });
}

// ---------------------------------------------------------------------------
// Outbox dispatch (one place that knows how to send each kind)
// ---------------------------------------------------------------------------

export type OutboxPayload =
  | { kind: 'CREATE_REQUEST'; body: CreateAttendanceRequest }
  | { kind: 'CONFIRM'; body: ConfirmAttendance }
  | { kind: 'AUTO'; body: AutoAttendance }
  | { kind: 'CANCEL'; body: CancelAttendance }
  | { kind: 'UNRESOLVED'; body: UnresolvedAttendance }
  | { kind: 'NOTIFICATION_EVENT'; body: NotificationEventInput }
  | { kind: 'CORRECTION'; body: CreateCorrection };

export async function dispatch(api: AttendanceApi, requestId: string | null, p: OutboxPayload): Promise<unknown> {
  const id = requestId ?? '';
  switch (p.kind) {
    case 'CREATE_REQUEST':
      return api.createRequest(p.body);
    case 'CONFIRM':
      return api.confirm(id, p.body);
    case 'AUTO':
      return api.auto(id, p.body);
    case 'CANCEL':
      return api.cancel(id, p.body);
    case 'UNRESOLVED':
      return api.unresolved(id, p.body);
    case 'NOTIFICATION_EVENT':
      await api.postNotificationEvent(p.body);
      return null;
    case 'CORRECTION':
      return api.createCorrection(p.body);
  }
}

export function outboxPayload(entry: OutboxEntry): OutboxPayload {
  return { kind: entry.kind, body: entry.payload } as OutboxPayload;
}

export type SendOutcome<T> = { kind: 'SENT'; response: T } | { kind: 'QUEUED'; outboxId: number };

/**
 * Sends now, or queues when the backend cannot answer (offline / 5xx / login expired). If earlier entries for
 * the same request are still queued, the new one is queued behind them so the backend always sees the
 * create before the action (ordering guarantee of the outbox). Definitive 4xx answers are thrown.
 */
export async function sendOrQueue<T>(
  deps: Pick<AppDeps, 'api' | 'store' | 'scheduler' | 'clock'>,
  requestId: string | null,
  idempotencyKey: string,
  payload: OutboxPayload,
): Promise<SendOutcome<T>> {
  const mustQueue = requestId != null && (await deps.store.hasPendingOutboxFor(requestId));
  if (!mustQueue) {
    try {
      const response = (await dispatch(deps.api, requestId, payload)) as T;
      return { kind: 'SENT', response };
    } catch (e) {
      if (!isRetryable(e)) throw e;
      await logEvent(deps, 'ACTION_QUEUED', requestId, { kind: payload.kind, error: errorMessage(e) });
    }
  }
  const outboxId = await deps.store.enqueueOutbox(
    { requestId, kind: payload.kind as OutboxKind, idempotencyKey, payload: payload.body },
    nowIso(deps),
  );
  try {
    await deps.scheduler.scheduleSync();
  } catch {
    /* sync also runs on foreground / NetInfo */
  }
  return { kind: 'QUEUED', outboxId };
}

// ---------------------------------------------------------------------------
// Applying backend answers
// ---------------------------------------------------------------------------

function upsertSession(list: SessionDto[], s: SessionDto): SessionDto[] {
  const others = list.filter((x) => x.id !== s.id);
  return [...others, s].sort((a, b) => a.checkInAt.localeCompare(b.checkInAt));
}

/** Applies an action result (confirm/auto/cancel/unresolved) to the local request and the state snapshot. */
export async function applyActionResult(
  deps: Pick<AppDeps, 'store' | 'scheduler' | 'notifier' | 'clock' | 'onLocalChange'>,
  requestId: string,
  result: AttendanceActionResult,
): Promise<void> {
  const req = await deps.store.getRequest(requestId);
  const stillQueued = await deps.store.hasPendingOutboxFor(requestId);
  await deps.store.updateRequest(requestId, {
    status: result.status,
    method: result.method,
    sessionId: result.sessionId,
    officialTime: result.officialTime,
    resolutionReason: result.reason,
    lastClassification: result.classification ?? req?.lastClassification ?? null,
    lastDistanceM: result.distanceM ?? req?.lastDistanceM ?? null,
    localAction: result.status === RequestStatus.ACTIVE ? (req?.localAction ?? null) : null,
    syncStatus: stillQueued ? SyncStatus.PENDING_SYNC : SyncStatus.SYNCED,
    lastError: null,
    updatedAt: nowIso(deps),
  });

  if (req && result.status === RequestStatus.APPROVED && result.sessionId) {
    const snap: StateSnapshot = (await deps.store.getSnapshot()) ?? {
      openSession: null,
      todaySessions: [],
      activeConfigVersion: req.configVersion,
      serverTime: nowIso(deps),
      fetchedAt: nowIso(deps),
    };
    const official = result.officialTime ?? nowIso(deps);
    const method = result.method ?? Method.MANUAL;
    if (req.type === RequestType.CHECK_IN) {
      const session: SessionDto = {
        id: result.sessionId,
        checkInAt: official,
        checkInMethod: method,
        checkOutAt: null,
        checkOutMethod: null,
        status: SessionStatus.OPEN,
        corrected: false,
      };
      await deps.store.saveSnapshot({ ...snap, openSession: session, todaySessions: upsertSession(snap.todaySessions, session) });
    } else {
      const base =
        snap.openSession && snap.openSession.id === result.sessionId
          ? snap.openSession
          : snap.todaySessions.find((s) => s.id === result.sessionId);
      const closed: SessionDto | null = base
        ? { ...base, checkOutAt: official, checkOutMethod: method, status: SessionStatus.COMPLETED }
        : null;
      await deps.store.saveSnapshot({
        ...snap,
        openSession: null,
        todaySessions: closed ? upsertSession(snap.todaySessions, closed) : snap.todaySessions,
      });
    }
  }

  if (result.status !== RequestStatus.ACTIVE) {
    await safe(() => deps.scheduler.cancel(requestId));
    await safe(() => deps.notifier.dismissAttendanceRequest(requestId));
  }
  await logEvent(deps, 'ACTION_RESULT', requestId, {
    status: result.status,
    method: result.method,
    officialTime: result.officialTime,
    classification: result.classification,
    distanceM: result.distanceM,
    reason: result.reason,
  });
  changed(deps);
}

/** Applies the backend's copy of a request (create response / state refresh). */
export async function applyRequestDto(
  deps: Pick<AppDeps, 'store' | 'clock'>,
  dto: AttendanceRequestDto,
): Promise<void> {
  const req = await deps.store.getRequest(dto.id);
  const stillQueued = await deps.store.hasPendingOutboxFor(dto.id);
  const patch: Partial<LocalRequest> = {
    deadlineAt: dto.deadlineAt,
    configVersion: dto.configVersion,
    syncStatus: stillQueued ? SyncStatus.PENDING_SYNC : SyncStatus.SYNCED,
    updatedAt: nowIso(deps),
  };
  // A replayed create may report an already-finished request; do not overwrite a queued local decision.
  if (dto.status !== RequestStatus.ACTIVE && !req?.localAction) {
    Object.assign(patch, {
      status: dto.status,
      method: dto.method,
      sessionId: dto.sessionId,
      officialTime: dto.approvedAt,
      resolutionReason: dto.resolutionReason,
    });
  }
  await deps.store.updateRequest(dto.id, patch);
}

export function localRequestFromDto(dto: AttendanceRequestDto, now: string): LocalRequest {
  return {
    requestId: dto.id,
    type: dto.type,
    status: dto.status,
    sessionId: dto.sessionId,
    configVersion: dto.configVersion,
    geofenceDetectedAt: dto.geofenceDetectedAt,
    notificationStatus: dto.notificationStatus,
    notificationPostedAt: dto.notificationPostedAt,
    deadlineAt: dto.deadlineAt,
    method: dto.method,
    syncStatus: SyncStatus.SYNCED,
    localAction: null,
    lastClassification: null,
    lastDistanceM: null,
    resolutionReason: dto.resolutionReason,
    officialTime: dto.approvedAt,
    userConfirmedAt: null,
    lastError: null,
    createdAt: dto.createdAt,
    updatedAt: now,
  };
}

/** Marks a request as definitively refused by the backend (e.g. 409 on create) and stops its automation. */
export async function markRequestRefused(
  deps: Pick<AppDeps, 'store' | 'scheduler' | 'notifier' | 'clock' | 'onLocalChange'>,
  requestId: string,
  error: ApiRequestError,
): Promise<void> {
  await deps.store.updateRequest(requestId, {
    status: RequestStatus.REJECTED,
    resolutionReason: error.code,
    localAction: null,
    syncStatus: SyncStatus.FAILED,
    lastError: error.code,
    updatedAt: nowIso(deps),
  });
  // Drop anything else queued for this request: the backend will never accept it.
  for (const e of await deps.store.listOutbox()) {
    if (e.requestId === requestId) await deps.store.deleteOutbox(e.id);
  }
  await safe(() => deps.scheduler.cancel(requestId));
  await safe(() => deps.notifier.dismissAttendanceRequest(requestId));
  await logEvent(deps, 'REQUEST_REJECTED', requestId, { code: error.code, status: error.status });
  changed(deps);
}

// ---------------------------------------------------------------------------
// Server state refresh
// ---------------------------------------------------------------------------

export function snapshotFrom(resp: AttendanceStateResponse, fetchedAt: string): StateSnapshot {
  return {
    openSession: resp.openSession,
    todaySessions: resp.todaySessions,
    activeConfigVersion: resp.activeConfigVersion,
    serverTime: resp.serverTime,
    fetchedAt,
  };
}

/**
 * GET /attendance/state → snapshot. Adopts a server-side ACTIVE request the device does not know about
 * (e.g. after reinstall) and makes sure it has a grace job. Returns null when offline.
 */
export async function refreshState(
  deps: Pick<AppDeps, 'api' | 'store' | 'scheduler' | 'clock' | 'onLocalChange'>,
): Promise<AttendanceStateResponse | null> {
  let resp: AttendanceStateResponse;
  try {
    resp = await deps.api.getState();
  } catch {
    return null;
  }
  await deps.store.saveSnapshot(snapshotFrom(resp, nowIso(deps)));
  const active = resp.activeRequest;
  if (active && active.status === RequestStatus.ACTIVE) {
    const local = await deps.store.getRequest(active.id);
    if (!local) {
      await deps.store.insertRequest(localRequestFromDto(active, nowIso(deps)));
      const delay = Math.max(0, Date.parse(active.deadlineAt) - deps.clock.now().getTime());
      await safe(() => deps.scheduler.schedule(active.id, delay));
    }
  }
  changed(deps);
  return resp;
}

export async function safe<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

/** Records a notification event for evaluation (best effort, queued behind the request's create). */
export async function recordNotificationEvent(
  deps: Pick<AppDeps, 'api' | 'store' | 'scheduler' | 'clock' | 'uuid'>,
  input: NotificationEventInput,
): Promise<void> {
  try {
    await sendOrQueue(deps, input.requestId, deps.uuid(), { kind: 'NOTIFICATION_EVENT', body: input });
  } catch (e) {
    // 4xx on an evaluation event is not worth surfacing to the user.
    if (!isApiError(e)) throw e;
  }
}

export function notificationStatusOf(present: { status: 'POSTED' | 'FAILED' }): NotificationStatus {
  return present.status === 'POSTED' ? NotificationStatus.POSTED : NotificationStatus.FAILED;
}
