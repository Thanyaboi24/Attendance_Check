import { type AttendanceActionResult, SyncStatus } from '@attendance/shared';
import { type ApiRequestError, errorMessage, isApiError } from '../errors';
import type { LocalActionKind } from '../models';
import type { AppDeps } from '../ports';
import { applyActionResult, changed, logEvent, nowIso, type OutboxPayload, safe, sendOrQueue } from './common';

export type DecisionPayload = Extract<OutboxPayload, { kind: LocalActionKind }>;

export type DecisionOutcome =
  | { kind: 'RESULT'; result: AttendanceActionResult }
  /** Saved in the outbox: UI shows "Pending synchronization", never "Recorded". */
  | { kind: 'QUEUED' }
  /** Definitive 4xx from the backend (e.g. 422 LOCATION_NOT_CONFIRMED, 409 GRACE_PERIOD_NOT_EXPIRED). */
  | { kind: 'API_ERROR'; error: ApiRequestError };

/** Sends a confirm / auto / cancel / unresolved decision with the request id as idempotency key. */
export async function submitDecision(deps: AppDeps, requestId: string, payload: DecisionPayload): Promise<DecisionOutcome> {
  await logEvent(deps, 'ACTION_SENT', requestId, { kind: payload.kind });
  try {
    const out = await sendOrQueue<AttendanceActionResult>(deps, requestId, requestId, payload);
    if (out.kind === 'SENT') {
      await applyActionResult(deps, requestId, out.response);
      return { kind: 'RESULT', result: out.response };
    }
    await deps.store.updateRequest(requestId, {
      localAction: payload.kind,
      syncStatus: SyncStatus.PENDING_SYNC,
      updatedAt: nowIso(deps),
    });
    // The decision is made; the grace job must not decide again. (If the backend later refuses a queued
    // manual confirm, syncOutbox re-schedules the job.)
    await safe(() => deps.scheduler.cancel(requestId));
    changed(deps);
    return { kind: 'QUEUED' };
  } catch (e) {
    if (isApiError(e)) {
      await deps.store.updateRequest(requestId, { lastError: e.code, updatedAt: nowIso(deps) });
      await logEvent(deps, 'ACTION_ERROR', requestId, { kind: payload.kind, status: e.status, code: e.code });
      changed(deps);
      return { kind: 'API_ERROR', error: e };
    }
    await logEvent(deps, 'ACTION_ERROR', requestId, { kind: payload.kind, error: errorMessage(e) });
    throw e;
  }
}
