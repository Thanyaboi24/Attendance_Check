import { ApiRequestError, LocationUnavailableError } from '../src/domain/errors';
import { displayStatusOf } from '../src/domain/displayStatus';
import { confirmAttendance } from '../src/domain/useCases/confirmAttendance';
import { evaluateAutoAttendance } from '../src/domain/useCases/evaluateAutoAttendance';
import { handleGeofenceTransition } from '../src/domain/useCases/handleGeofenceTransition';
import { __resetSyncForTests, syncOutbox } from '../src/domain/useCases/syncOutbox';
import { BOUNDARY, type Harness, INSIDE, makeDeps, OUTSIDE } from './fakes/makeDeps';

async function pending(h: Harness, transition: 'ENTER' | 'EXIT' = 'ENTER'): Promise<string> {
  const out = await handleGeofenceTransition(h.deps, { transition, regionId: 'faculty-v1', detectedAt: h.clock.now().toISOString() });
  if (out.kind !== 'REQUEST_CREATED') throw new Error(out.kind);
  return out.requestId;
}
const confirm = (h: Harness, id: string) =>
  confirmAttendance(h.deps, { requestId: id, userConfirmedAt: h.clock.now().toISOString(), via: 'NOTIFICATION' });

beforeEach(() => __resetSyncForTests());

describe('confirmAttendance (manual Check In / Check Out)', () => {
  it('DS2 #1 entry + manual confirmation with fresh Confirmed Inside → one manual check-in recorded', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await pending(h);
    h.clock.advance(30_000);
    h.location.next(INSIDE);

    const out = await confirm(h, id);
    expect(out).toMatchObject({ kind: 'RECORDED', result: { status: 'APPROVED', method: 'MANUAL' } });
    expect(h.scheduler.jobs.has(id)).toBe(false); // grace job cancelled
    expect(h.notifier.dismissed).toContain(id);
    expect(h.backend.notificationEvents.map((e) => e.type)).toEqual(['POSTED', 'RESPONDED']);
    expect(await h.store.getRequest(id)).toMatchObject({ status: 'APPROVED', userConfirmedAt: expect.any(String) });
    expect(h.store.snapshot?.openSession).not.toBeNull();
  });

  it('DS2 #4 exit + manual confirmation with fresh Confirmed Outside → manual check-out', async () => {
    const h = makeDeps();
    await h.seed({ openSession: true });
    const id = await pending(h, 'EXIT');
    h.location.next(OUTSIDE);
    expect(await confirm(h, id)).toMatchObject({ kind: 'RECORDED', result: { method: 'MANUAL' } });
    expect(h.backend.openSession).toBeNull();
  });

  it('fresh fix not on the expected side → LOCATION_NOT_CONFIRMED (client) with the reason; request stays pending', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await pending(h);
    h.location.next(BOUNDARY);
    const out = await confirm(h, id);
    expect(out).toMatchObject({
      kind: 'LOCATION_NOT_CONFIRMED',
      source: 'CLIENT',
      classification: 'UNCERTAIN',
      uncertainReason: 'STRADDLES_BOUNDARY',
    });
    expect(h.backend.callsOf('confirm')).toHaveLength(0);
    expect((await h.store.getRequest(id))?.status).toBe('ACTIVE');

    // Retry succeeds once the fix is good
    h.location.next(INSIDE);
    expect(await confirm(h, id)).toMatchObject({ kind: 'RECORDED' });
  });

  it('backend answers 422 LOCATION_NOT_CONFIRMED → reason from the server, request stays ACTIVE', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await pending(h);
    h.location.next(INSIDE);
    h.backend.failNext(
      'confirm',
      new ApiRequestError(422, 'LOCATION_NOT_CONFIRMED', 'not confirmed', {
        classification: 'UNCERTAIN',
        distanceM: 140,
        uncertainReason: 'STALE_READING',
      }),
    );
    const out = await confirm(h, id);
    expect(out).toEqual({
      kind: 'LOCATION_NOT_CONFIRMED',
      source: 'SERVER',
      classification: 'UNCERTAIN',
      distanceM: 140,
      uncertainReason: 'STALE_READING',
    });
    expect(await h.store.getRequest(id)).toMatchObject({ status: 'ACTIVE', lastError: 'LOCATION_NOT_CONFIRMED' });
    expect(h.scheduler.jobs.has(id)).toBe(true); // automation still possible
  });

  it('DS2 #14 offline → PENDING_SYNC (never "Recorded"); auto job skips; sync records it', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await pending(h);
    h.location.next(INSIDE);
    h.backend.offline = true;

    const out = await confirm(h, id);
    expect(out).toEqual({ kind: 'PENDING_SYNC' });
    const local = await h.store.getRequest(id);
    expect(displayStatusOf(local!)).toBe('UNSYNCHRONIZED');
    expect(h.scheduler.jobs.has(id)).toBe(false);

    h.clock.advance(300_000);
    expect(await evaluateAutoAttendance(h.deps, id)).toEqual({ kind: 'SKIPPED', reason: 'PENDING_SYNC' });

    h.backend.offline = false;
    h.clock.advance(-290_000); // back online quickly: the evidence is still fresh for the server
    const sync = await syncOutbox(h.deps);
    expect(sync.remaining).toBe(0);
    expect(await h.store.getRequest(id)).toMatchObject({ status: 'APPROVED', method: 'MANUAL', syncStatus: 'SYNCED' });
  });

  it('DS2 #10 manual and automatic race: the loser gets the stored winner result (no duplicate session)', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await pending(h);
    h.clock.advance(305_000);
    // the automatic decision reached the server first; this device has not seen the result yet
    const now = h.clock.now().toISOString();
    await h.backend.auto(id, {
      notificationPostedAt: (await h.store.getRequest(id))!.notificationPostedAt!,
      clientRecordedAt: now,
      evidence: { lat: h.cfg.centerLat, lng: h.cfg.centerLng, accuracyM: 5, measuredAt: now, isMock: false },
    });
    h.location.next(INSIDE);
    const out = await confirm(h, id);
    expect(out).toMatchObject({ kind: 'RECORDED', result: { method: 'AUTOMATIC' } });
    expect(h.backend.sessions).toHaveLength(1);
  });

  it('mock location → REJECTED by the backend', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await pending(h);
    h.location.next({ ...INSIDE, isMock: true });
    expect(await confirm(h, id)).toMatchObject({ kind: 'REJECTED', reason: 'MOCK_LOCATION' });
    expect(displayStatusOf((await h.store.getRequest(id))!)).toBe('FAILED');
  });

  it('location unavailable → explains why (permission / services / timeout)', async () => {
    const h = makeDeps();
    await h.seed();
    const id = await pending(h);
    h.location.next(new LocationUnavailableError('SERVICES_DISABLED', 'Location services are off'));
    expect(await confirm(h, id)).toMatchObject({ kind: 'LOCATION_UNAVAILABLE', reason: 'SERVICES_DISABLED' });
  });
});
