import { type AttendanceActionResult, type AttendanceRequestDto, SyncStatus } from '@attendance/shared';
import { type ApiRequestError, errorMessage, isApiError, isAuthError, isNetworkError, isRetryable } from '../errors';
import type { OutboxEntry } from '../models';
import type { AppDeps } from '../ports';
import {
  applyActionResult,
  applyRequestDto,
  changed,
  dispatch,
  logEvent,
  markRequestRefused,
  nowIso,
  outboxPayload,
  refreshState,
  safe,
} from './common';

export const OUTBOX_BACKOFF = { baseMs: 5_000, maxMs: 15 * 60_000 } as const;

/** Exponential backoff: 5 s, 10 s, 20 s … capped at 15 min. `attempts` = failures so far (≥ 1). */
export function backoffMs(attempts: number): number {
  return Math.min(OUTBOX_BACKOFF.baseMs * 2 ** Math.max(0, attempts - 1), OUTBOX_BACKOFF.maxMs);
}

export interface SyncSummary {
  skipped?: 'SIGNED_OUT';
  sent: number;
  failed: number;
  deferred: number;
  remaining: number;
  offline: boolean;
}

let inFlight: Promise<SyncSummary> | null = null;

/**
 * Replays the outbox (design §7.8, §9.3). Triggered by NetInfo, app foreground, after GracePeriodTask and by the
 * native SyncTask (WorkManager, network-connected constraint).
 *
 * - FIFO per request: an entry is never sent while an earlier entry of the same request is waiting, so the
 *   create always reaches the backend before its confirm/auto/cancel/unresolved.
 * - Same idempotency key on every replay → the backend returns the stored result (no duplicate records).
 * - Network error / 5xx → exponential backoff; network error stops the pass (we are offline).
 * - Definitive 4xx → the backend's answer wins (see `onRejected`).
 * Single-flight: concurrent callers share one pass.
 */
export function syncOutbox(deps: AppDeps): Promise<SyncSummary> {
  if (!inFlight) {
    inFlight = runSync(deps).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function runSync(deps: AppDeps): Promise<SyncSummary> {
  const summary: SyncSummary = { sent: 0, failed: 0, deferred: 0, remaining: 0, offline: false };
  if (!(await deps.session.getTokens())) {
    summary.skipped = 'SIGNED_OUT';
    summary.remaining = (await deps.store.listOutbox()).filter((e) => e.status === 'PENDING').length;
    return summary;
  }

  const entries = await deps.store.listOutbox();
  const blocked = new Set<string>();
  const now = deps.clock.now().getTime();
  let touchedAttendance = false;

  for (const entry of entries) {
    if (entry.status === 'FAILED') continue;
    if (summary.offline) {
      summary.deferred++;
      continue;
    }
    if (entry.requestId && blocked.has(entry.requestId)) {
      summary.deferred++;
      continue;
    }
    // The entry may have been removed while processing an earlier one (refused create).
    if (entry.requestId && !(await stillQueued(deps, entry.id))) continue;
    if (Date.parse(entry.nextAttemptAt) > now) {
      if (entry.requestId) blocked.add(entry.requestId);
      summary.deferred++;
      continue;
    }

    try {
      const response = await dispatch(deps.api, entry.requestId, outboxPayload(entry));
      await deps.store.deleteOutbox(entry.id);
      summary.sent++;
      await onSent(deps, entry, response);
      if (entry.kind !== 'NOTIFICATION_EVENT') touchedAttendance = true;
      await logEvent(deps, 'OUTBOX_SYNCED', entry.requestId, { kind: entry.kind, outboxId: entry.id, attempts: entry.attempts + 1 });
    } catch (e) {
      if (isRetryable(e) || (isApiError(e) && e.code === 'GRACE_PERIOD_NOT_EXPIRED')) {
        await retryLater(deps, entry, e);
        if (entry.requestId) blocked.add(entry.requestId);
        if (isNetworkError(e) || isAuthError(e)) summary.offline = true;
        summary.deferred++;
        continue;
      }
      if (isApiError(e) && entry.kind === 'CORRECTION') {
        // Keep the user's correction visible as "Failed" instead of silently dropping it.
        await deps.store.updateOutbox(entry.id, { status: 'FAILED', lastError: e.code, attempts: entry.attempts + 1 });
        summary.failed++;
        continue;
      }
      if (isApiError(e)) {
        await deps.store.deleteOutbox(entry.id);
        const keepBlocking = await onRejected(deps, entry, e);
        if (keepBlocking && entry.requestId) blocked.add(entry.requestId);
        summary.failed++;
        touchedAttendance = true;
        continue;
      }
      // Contract error or bug: park the entry instead of retrying forever.
      await deps.store.updateOutbox(entry.id, { status: 'FAILED', lastError: errorMessage(e), attempts: entry.attempts + 1 });
      await markLocalFailed(deps, entry, 'CONTRACT_ERROR');
      summary.failed++;
    }
  }

  summary.remaining = (await deps.store.listOutbox()).filter((e) => e.status === 'PENDING').length;
  if (touchedAttendance && !summary.offline) await refreshState(deps);
  changed(deps);
  return summary;
}

async function stillQueued(deps: AppDeps, id: number): Promise<boolean> {
  return (await deps.store.listOutbox()).some((e) => e.id === id);
}

async function retryLater(deps: AppDeps, entry: OutboxEntry, e: unknown): Promise<void> {
  const attempts = entry.attempts + 1;
  const delay =
    isApiError(e) && e.code === 'GRACE_PERIOD_NOT_EXPIRED' ? Math.max(backoffMs(attempts), 30_000) : backoffMs(attempts);
  await deps.store.updateOutbox(entry.id, {
    attempts,
    nextAttemptAt: new Date(deps.clock.now().getTime() + delay).toISOString(),
    lastError: isApiError(e) ? e.code : errorMessage(e),
  });
  await logEvent(deps, 'OUTBOX_RETRY', entry.requestId, { kind: entry.kind, attempts, delayMs: delay, error: errorMessage(e) });
}

async function onSent(deps: AppDeps, entry: OutboxEntry, response: unknown): Promise<void> {
  if (!entry.requestId) return;
  switch (entry.kind) {
    case 'CREATE_REQUEST': {
      const dto = response as AttendanceRequestDto;
      await applyRequestDto(deps, dto);
      // The backend's deadline is authoritative; WorkManager KEEP ignores this if a job is already pending.
      const req = await deps.store.getRequest(entry.requestId);
      if (req && !req.localAction && req.status === 'ACTIVE') {
        const delay = Math.max(0, Date.parse(req.deadlineAt) - deps.clock.now().getTime());
        await safe(() => deps.scheduler.schedule(entry.requestId as string, delay));
      }
      return;
    }
    case 'CONFIRM':
    case 'AUTO':
    case 'CANCEL':
    case 'UNRESOLVED':
      await applyActionResult(deps, entry.requestId, response as AttendanceActionResult);
      return;
    default:
      return;
  }
}

/**
 * Definitive refusal. Returns true when later entries of the same request must stay blocked.
 * - create 409/404/400 → the request is REJECTED locally; its queued actions are dropped (they can never succeed).
 * - confirm/cancel 422 LOCATION_NOT_CONFIRMED → the request is still ACTIVE on the backend (the stored evidence
 *   was stale by the time it arrived); the queued decision is cleared and the grace job re-evaluates with a new fix.
 * - anything else → the request is marked FAILED (UI "Failed").
 */
async function onRejected(deps: AppDeps, entry: OutboxEntry, e: ApiRequestError): Promise<boolean> {
  await logEvent(deps, 'OUTBOX_FAILED', entry.requestId, { kind: entry.kind, status: e.status, code: e.code });
  if (!entry.requestId || entry.kind === 'NOTIFICATION_EVENT') return false;

  if (entry.kind === 'CREATE_REQUEST') {
    await markRequestRefused(deps, entry.requestId, e);
    return true;
  }
  if (e.code === 'LOCATION_NOT_CONFIRMED' && (entry.kind === 'CONFIRM' || entry.kind === 'CANCEL')) {
    const req = await deps.store.getRequest(entry.requestId);
    await deps.store.updateRequest(entry.requestId, {
      localAction: null,
      syncStatus: SyncStatus.SYNCED,
      lastError: e.code,
      updatedAt: nowIso(deps),
    });
    if (req) {
      const delay = Math.max(0, Date.parse(req.deadlineAt) - deps.clock.now().getTime());
      await safe(() => deps.scheduler.schedule(entry.requestId as string, delay));
    }
    return false;
  }
  await markLocalFailed(deps, entry, e.code);
  return false;
}

async function markLocalFailed(deps: AppDeps, entry: OutboxEntry, code: string): Promise<void> {
  if (!entry.requestId || entry.kind === 'NOTIFICATION_EVENT' || entry.kind === 'CORRECTION') return;
  await deps.store.updateRequest(entry.requestId, {
    syncStatus: SyncStatus.FAILED,
    localAction: null,
    lastError: code,
    updatedAt: nowIso(deps),
  });
}

/** For tests: forget a hung in-flight pass. */
export function __resetSyncForTests(): void {
  inFlight = null;
}
