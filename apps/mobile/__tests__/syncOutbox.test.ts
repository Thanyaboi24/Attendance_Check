import { ApiRequestError, NetworkError } from '../src/domain/errors';
import { confirmAttendance } from '../src/domain/useCases/confirmAttendance';
import { handleGeofenceTransition } from '../src/domain/useCases/handleGeofenceTransition';
import { __resetSyncForTests, backoffMs, syncOutbox } from '../src/domain/useCases/syncOutbox';
import { type Harness, INSIDE, makeDeps } from './fakes/makeDeps';

async function offlineEntryAndConfirm(h: Harness): Promise<string> {
  h.backend.offline = true;
  const out = await handleGeofenceTransition(h.deps, { transition: 'ENTER', regionId: 'faculty-v1', detectedAt: h.clock.now().toISOString() });
  if (out.kind !== 'REQUEST_CREATED') throw new Error(out.kind);
  h.location.next(INSIDE);
  expect(await confirmAttendance(h.deps, { requestId: out.requestId, userConfirmedAt: h.clock.now().toISOString() })).toEqual({
    kind: 'PENDING_SYNC',
  });
  h.backend.calls = [];
  return out.requestId;
}

beforeEach(() => __resetSyncForTests());

describe('syncOutbox', () => {
  it('replays create before action, with the request id as idempotency key (DS2 #14)', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await offlineEntryAndConfirm(h);
    expect(h.store.outbox.map((e) => e.kind)).toEqual(['CREATE_REQUEST', 'NOTIFICATION_EVENT', 'CONFIRM']);

    h.backend.offline = false;
    h.backend.calls = [];
    const s = await syncOutbox(h.deps);
    expect(s).toMatchObject({ sent: 3, failed: 0, remaining: 0, offline: false });
    expect(h.backend.calls.filter((c) => c.method !== 'getState').map((c) => c.method)).toEqual([
      'createRequest',
      'postNotificationEvent',
      'confirm',
    ]);
    expect(h.backend.calls.every((c) => c.method === 'getState' || c.requestId === id)).toBe(true);
    expect(await h.store.getRequest(id)).toMatchObject({ status: 'APPROVED', syncStatus: 'SYNCED', localAction: null });
  });

  it('DS2 #9 idempotent replay: a response lost after the server processed it is replayed without a duplicate', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await offlineEntryAndConfirm(h);
    h.backend.offline = false;
    h.backend.loseNextResponse('confirm'); // server stores the result, client sees a network error

    const first = await syncOutbox(h.deps);
    expect(first).toMatchObject({ offline: true, remaining: 1 });
    expect(h.backend.sessions).toHaveLength(1);
    expect((await h.store.getRequest(id))?.localAction).toBe('CONFIRM');

    h.clock.advance(backoffMs(1));
    const second = await syncOutbox(h.deps);
    expect(second).toMatchObject({ sent: 1, remaining: 0 });
    expect(h.backend.callsOf('confirm')).toHaveLength(2);
    expect(h.backend.sessions).toHaveLength(1); // still exactly one session
    expect(await h.store.getRequest(id)).toMatchObject({ status: 'APPROVED', syncStatus: 'SYNCED' });
  });

  it('backs off exponentially on network errors / 5xx and does not send later entries of the same request', async () => {
    const h = makeDeps();
    await h.seed();
    await offlineEntryAndConfirm(h);
    h.backend.offline = false;
    h.backend.failNext('createRequest', new ApiRequestError(503, 'HTTP_503', 'unavailable'), 2);

    const s1 = await syncOutbox(h.deps);
    expect(s1.sent).toBe(0);
    expect(h.backend.callsOf('confirm')).toHaveLength(0); // blocked behind its create
    const create = h.store.outbox.find((e) => e.kind === 'CREATE_REQUEST')!;
    expect(create.attempts).toBe(1);
    expect(Date.parse(create.nextAttemptAt) - h.clock.t).toBe(5_000);

    // not due yet → nothing is sent
    await syncOutbox(h.deps);
    expect(h.backend.callsOf('createRequest')).toHaveLength(1);

    h.clock.advance(5_000);
    await syncOutbox(h.deps);
    const again = h.store.outbox.find((e) => e.kind === 'CREATE_REQUEST')!;
    expect(again.attempts).toBe(2);
    expect(Date.parse(again.nextAttemptAt) - h.clock.t).toBe(10_000);

    h.clock.advance(10_000);
    const s3 = await syncOutbox(h.deps);
    expect(s3.remaining).toBe(0);
    expect(backoffMs(20)).toBe(15 * 60_000);
  });

  it('stops the pass when offline', async () => {
    const h = makeDeps();
    await h.seed();
    await offlineEntryAndConfirm(h);
    h.backend.calls = [];
    const s = await syncOutbox(h.deps);
    expect(s.offline).toBe(true);
    expect(h.backend.calls).toHaveLength(1);
  });

  it('DS2 #11 409 on a queued create (session state changed meanwhile) → request rejected, queued action dropped', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await offlineEntryAndConfirm(h);
    h.backend.offline = false;
    // another device / admin opened a session meanwhile
    h.backend.openSession = { id: 's-x', checkInAt: h.clock.now().toISOString(), checkInMethod: 'MANUAL', checkOutAt: null, checkOutMethod: null, status: 'OPEN', corrected: false };

    const s = await syncOutbox(h.deps);
    expect(s.failed).toBe(1);
    expect(h.store.outbox).toHaveLength(0);
    expect(h.backend.callsOf('confirm')).toHaveLength(0);
    expect(await h.store.getRequest(id)).toMatchObject({ status: 'REJECTED', resolutionReason: 'SESSION_ALREADY_OPEN', syncStatus: 'FAILED' });
    expect(h.scheduler.jobs.has(id)).toBe(false);
  });

  it('409 GRACE_PERIOD_NOT_EXPIRED on a queued auto decision is retried later, not dropped', async () => {
    const h = makeDeps();
    await h.seed();
    const out = await handleGeofenceTransition(h.deps, { transition: 'ENTER', regionId: 'faculty-v1', detectedAt: h.clock.now().toISOString() });
    const id = (out as { requestId: string }).requestId;
    await h.store.enqueueOutbox(
      {
        requestId: id,
        kind: 'AUTO',
        idempotencyKey: id,
        payload: {
          notificationPostedAt: h.clock.now().toISOString(),
          clientRecordedAt: h.clock.now().toISOString(),
          evidence: { lat: h.cfg.centerLat, lng: h.cfg.centerLng, accuracyM: 5, measuredAt: h.clock.now().toISOString(), isMock: false },
        },
      },
      h.clock.now().toISOString(),
    );
    const s = await syncOutbox(h.deps);
    expect(s.deferred).toBe(1);
    expect(h.store.outbox[0]).toMatchObject({ kind: 'AUTO', attempts: 1, lastError: 'GRACE_PERIOD_NOT_EXPIRED' });
  });

  it('a queued manual confirm refused with 422 (evidence too old on arrival) re-arms the grace job', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await offlineEntryAndConfirm(h);
    h.backend.offline = false;
    h.clock.advance(10 * 60_000); // evidence now 10 min old → server classifies UNCERTAIN (stale)
    const s = await syncOutbox(h.deps);
    expect(s.failed).toBe(1);
    expect(await h.store.getRequest(id)).toMatchObject({ status: 'ACTIVE', localAction: null, lastError: 'LOCATION_NOT_CONFIRMED' });
    expect(h.scheduler.log.at(-1)).toBe(`schedule:${id}:0`);
  });

  it('is single-flight', async () => {
    const h = makeDeps();
    await h.seed();
    await offlineEntryAndConfirm(h);
    h.backend.offline = false;
    const [a, b] = await Promise.all([syncOutbox(h.deps), syncOutbox(h.deps)]);
    expect(a).toBe(b);
    expect(h.backend.callsOf('createRequest')).toHaveLength(1);
  });

  it('skips when signed out but keeps the entries', async () => {
    const h = makeDeps();
    await h.seed();
    await offlineEntryAndConfirm(h);
    h.session.tokens = null;
    expect(await syncOutbox(h.deps)).toMatchObject({ skipped: 'SIGNED_OUT', remaining: 3 });
  });

  it('treats a network error as retryable', async () => {
    const h = makeDeps();
    await h.seed();
    await offlineEntryAndConfirm(h);
    h.backend.offline = false;
    h.backend.failNext('createRequest', new NetworkError());
    const s = await syncOutbox(h.deps);
    expect(s.offline).toBe(true);
    expect(h.store.outbox).toHaveLength(3);
  });
});
