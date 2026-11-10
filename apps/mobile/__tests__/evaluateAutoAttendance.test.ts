import { LocationUnavailableError } from '../src/domain/errors';
import { displayStatusOf } from '../src/domain/displayStatus';
import { confirmAttendance } from '../src/domain/useCases/confirmAttendance';
import { evaluateAutoAttendance } from '../src/domain/useCases/evaluateAutoAttendance';
import { handleGeofenceTransition } from '../src/domain/useCases/handleGeofenceTransition';
import { syncOutbox, __resetSyncForTests } from '../src/domain/useCases/syncOutbox';
import { BOUNDARY, type Harness, INSIDE, makeDeps, OUTSIDE } from './fakes/makeDeps';

const GRACE_MS = 300_000;

async function pending(h: Harness, transition: 'ENTER' | 'EXIT' = 'ENTER'): Promise<string> {
  const out = await handleGeofenceTransition(h.deps, {
    transition,
    regionId: 'faculty-v1',
    detectedAt: h.clock.now().toISOString(),
  });
  if (out.kind !== 'REQUEST_CREATED') throw new Error(`expected a request, got ${out.kind}`);
  return out.requestId;
}

/** WorkManager fires the job after the grace period. */
function fireAfterGrace(h: Harness, id: string, extraMs = 5_000) {
  h.clock.advance(GRACE_MS + extraMs);
  h.scheduler.fire(id);
}

beforeEach(() => __resetSyncForTests());

describe('evaluateAutoAttendance (GracePeriodTask)', () => {
  it('DS2 #2 no response + fresh Confirmed Inside after timeout → one automatic check-in', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await pending(h);
    fireAfterGrace(h, id);
    h.location.next(INSIDE);

    const out = await evaluateAutoAttendance(h.deps, id);
    expect(out).toMatchObject({ kind: 'SUBMITTED', action: 'AUTO', queued: false, locationAttempts: 1 });
    expect(h.backend.results.get(id)).toMatchObject({ status: 'APPROVED', method: 'AUTOMATIC' });
    const local = await h.store.getRequest(id);
    expect(local).toMatchObject({ status: 'APPROVED', method: 'AUTOMATIC', syncStatus: 'SYNCED' });
    expect(displayStatusOf(local!)).toBe('RECORDED');
    expect(h.store.snapshot?.openSession?.checkInMethod).toBe('AUTOMATIC');
    expect(h.notifier.info[0]?.title).toBe('Automatic check-in recorded');
    // the auto payload carries notificationPostedAt and the evidence the server re-classifies
    expect(h.backend.callsOf('auto')[0]?.body).toMatchObject({
      notificationPostedAt: expect.any(String),
      locationAttempts: 1,
      evidence: { clientClassification: 'CONFIRMED_INSIDE', isMock: false },
    });
  });

  it('DS2 #5 no response + fresh Confirmed Outside after timeout → one automatic check-out', async () => {
    const h = makeDeps();
    await h.seed({ openSession: true });
    const id = await pending(h, 'EXIT');
    fireAfterGrace(h, id);
    h.location.next(OUTSIDE);
    const out = await evaluateAutoAttendance(h.deps, id);
    expect(out).toMatchObject({ kind: 'SUBMITTED', action: 'AUTO' });
    expect(h.backend.openSession).toBeNull();
    expect(h.store.snapshot?.openSession).toBeNull();
  });

  it('timeout + confirmed on the opposite side → cancelled (no check-in)', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await pending(h);
    fireAfterGrace(h, id);
    h.location.next(OUTSIDE);
    const out = await evaluateAutoAttendance(h.deps, id);
    expect(out).toMatchObject({ kind: 'SUBMITTED', action: 'CANCEL' });
    expect(h.backend.results.get(id)?.status).toBe('CANCELLED');
    expect(h.backend.openSession).toBeNull();
  });

  it('DS2 #7 UNCERTAIN → 2 retries ~30 s apart → UNRESOLVED (never automatic)', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await pending(h);
    fireAfterGrace(h, id);
    h.location.always(BOUNDARY);
    const out = await evaluateAutoAttendance(h.deps, id);
    expect(out).toMatchObject({ kind: 'SUBMITTED', action: 'UNRESOLVED', reason: 'UNCERTAIN_LOCATION', locationAttempts: 3 });
    expect(h.location.calls).toBe(3);
    expect(h.sleeps).toEqual([30_000, 30_000]);
    expect(h.backend.callsOf('auto')).toHaveLength(0);
    expect(h.backend.results.get(id)).toMatchObject({ status: 'UNRESOLVED', reason: 'UNCERTAIN_LOCATION' });
    expect(displayStatusOf((await h.store.getRequest(id))!)).toBe('UNCERTAIN_LOCATION');
    expect(h.store.evidence.filter((e) => e.requestId === id && e.purpose === 'AUTO')).toHaveLength(3);
  });

  it('DS2 #8 old / low-accuracy readings are UNCERTAIN; a valid retry reading still allows automation', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await pending(h);
    fireAfterGrace(h, id);
    h.location.next({ distanceM: 20, ageSec: 120 }, { distanceM: 20, accuracyM: 80 }, INSIDE);
    const out = await evaluateAutoAttendance(h.deps, id);
    expect(out).toMatchObject({ kind: 'SUBMITTED', action: 'AUTO', locationAttempts: 3 });
    expect(h.store.evidence.map((e) => e.uncertainReason)).toEqual(['STALE_READING', 'LOW_ACCURACY', null]);
  });

  it('no fix at all (timeout / services off) → UNRESOLVED LOCATION_UNAVAILABLE', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await pending(h);
    fireAfterGrace(h, id);
    h.location.always(new LocationUnavailableError('TIMEOUT', 'timeout'));
    const out = await evaluateAutoAttendance(h.deps, id);
    expect(out).toMatchObject({ kind: 'SUBMITTED', action: 'UNRESOLVED', reason: 'LOCATION_UNAVAILABLE' });
    expect(h.backend.callsOf('unresolved')[0]?.body).toMatchObject({ reason: 'LOCATION_UNAVAILABLE', evidence: null });
  });

  it('DS2 #13 notification failed → UNRESOLVED / NOTIFICATION_FAILED without taking a fix', async () => {
    const h = makeDeps();
    await h.seed();
    h.notifier.fail = true;
    const id = await pending(h);
    fireAfterGrace(h, id);
    h.location.always(INSIDE);
    const out = await evaluateAutoAttendance(h.deps, id);
    expect(out).toMatchObject({ kind: 'SUBMITTED', action: 'UNRESOLVED', reason: 'NOTIFICATION_FAILED' });
    expect(h.location.calls).toBe(0);
    expect(h.backend.callsOf('auto')).toHaveLength(0);
    expect(h.backend.openSession).toBeNull();
  });

  it('DS2 #1/#10 already confirmed manually → the grace job skips (no second action)', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await pending(h);
    h.clock.advance(60_000);
    h.location.next(INSIDE);
    expect(await confirmAttendance(h.deps, { requestId: id, userConfirmedAt: h.clock.now().toISOString() })).toMatchObject({
      kind: 'RECORDED',
    });
    // WorkManager job already cancelled by the confirmation; even if it fires late:
    fireAfterGrace(h, id);
    const out = await evaluateAutoAttendance(h.deps, id);
    expect(out).toEqual({ kind: 'SKIPPED', reason: 'REQUEST_NOT_ACTIVE' });
    expect(h.backend.callsOf('auto')).toHaveLength(0);
    expect(h.backend.sessions).toHaveLength(1);
  });

  it('fires early (timer not exact) → WAIT and re-schedule', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await pending(h);
    h.clock.advance(100_000);
    h.scheduler.fire(id);
    const out = await evaluateAutoAttendance(h.deps, id);
    expect(out).toEqual({ kind: 'WAITING', rescheduledInMs: 200_000 });
    expect(h.scheduler.jobs.get(id)).toBe(200_000);
    expect(h.location.calls).toBe(0);
  });

  it('backend says the grace period has not expired (clock skew) → re-schedule, request stays pending', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await pending(h);
    h.clock.advance(GRACE_MS + 1_000);
    h.scheduler.fire(id);
    h.location.next(INSIDE);
    // server deadline later than the client one
    h.backend.requests.get(id)!.deadlineAt = new Date(h.clock.t + 120_000).toISOString();
    const out = await evaluateAutoAttendance(h.deps, id);
    expect(out).toEqual({ kind: 'WAITING', rescheduledInMs: 45_000 });
    expect((await h.store.getRequest(id))?.status).toBe('ACTIVE');
  });

  it('DS2 #14 offline at timeout → decision queued, shown as Pending synchronization, synced later', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await pending(h);
    fireAfterGrace(h, id);
    h.location.next(INSIDE);
    h.backend.offline = true;

    const out = await evaluateAutoAttendance(h.deps, id);
    expect(out).toMatchObject({ kind: 'SUBMITTED', action: 'AUTO', queued: true, result: null });
    const local = await h.store.getRequest(id);
    expect(local).toMatchObject({ status: 'ACTIVE', localAction: 'AUTO', syncStatus: 'PENDING_SYNC' });
    expect(displayStatusOf(local!)).toBe('UNSYNCHRONIZED');
    expect(h.notifier.info[0]?.title).toBe('Pending synchronization');
    expect(h.store.outbox.map((e) => e.kind)).toEqual(['AUTO']);

    h.backend.offline = false;
    h.clock.advance(20_000); // evidence is now 20 s old: still fresh for the server
    const sync = await syncOutbox(h.deps);
    expect(sync).toMatchObject({ sent: 1, remaining: 0 });
    expect(await h.store.getRequest(id)).toMatchObject({ status: 'APPROVED', syncStatus: 'SYNCED', localAction: null });
  });

  it('DS2 #20 a pending request keeps its original config version (fetched and cached)', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await pending(h);
    // Admin publishes v2 with a 300 m radius; the device only caches v2 and forgets v1.
    const v2 = { ...h.cfg, version: 2, radiusM: 300 };
    h.backend.configs.set(2, v2);
    h.backend.activeVersion = 2;
    h.store.configs.clear();
    await h.store.saveConfig(v2);

    fireAfterGrace(h, id);
    h.location.next({ distanceM: 200, accuracyM: 10 }); // inside v2, outside v1
    const out = await evaluateAutoAttendance(h.deps, id);
    expect(h.backend.callsOf('getConfig')).toHaveLength(1);
    expect(await h.store.getConfig(1)).not.toBeNull();
    expect(out).toMatchObject({ kind: 'SUBMITTED', action: 'CANCEL' });
  });

  it('skips unknown requests', async () => {
    const h = makeDeps();
    await h.seed();
    expect(await evaluateAutoAttendance(h.deps, 'nope')).toEqual({ kind: 'SKIPPED', reason: 'NOT_FOUND' });
  });
});
