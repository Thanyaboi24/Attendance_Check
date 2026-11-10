import { ApiRequestError } from '../src/domain/errors';
import { configVersionFromRegion, handleGeofenceTransition } from '../src/domain/useCases/handleGeofenceTransition';
import { getLocalView } from '../src/domain/useCases/common';
import { BOUNDARY, INSIDE, makeDeps, OUTSIDE } from './fakes/makeDeps';

const enter = (h: ReturnType<typeof makeDeps>) =>
  handleGeofenceTransition(h.deps, { transition: 'ENTER', regionId: 'faculty-v1', detectedAt: h.clock.now().toISOString() });
const exit = (h: ReturnType<typeof makeDeps>) =>
  handleGeofenceTransition(h.deps, { transition: 'EXIT', regionId: 'faculty-v1', detectedAt: h.clock.now().toISOString() });

describe('handleGeofenceTransition', () => {
  it('parses the config version from the region id', () => {
    expect(configVersionFromRegion('faculty-v12')).toBe(12);
    expect(configVersionFromRegion('other')).toBeNull();
  });

  it('DS2 #1/#2 ENTER while checked out → CHECK_IN request, notification, POST, grace job', async () => {
    const h = makeDeps();
    await h.seed();
    const out = await enter(h);

    expect(out).toMatchObject({ kind: 'REQUEST_CREATED', type: 'CHECK_IN', notification: 'POSTED', sync: 'SYNCED' });
    const id = (out as { requestId: string }).requestId;
    const local = await h.store.getRequest(id);
    expect(local).toMatchObject({ status: 'ACTIVE', syncStatus: 'SYNCED', configVersion: 1, notificationStatus: 'POSTED' });
    expect(h.notifier.presented).toEqual([{ requestId: id, type: 'CHECK_IN', graceSec: 300 }]);
    expect(h.backend.requests.get(id)?.status).toBe('ACTIVE');
    expect(h.scheduler.jobs.get(id)).toBe(300_000);
    expect((await getLocalView(h.deps)).state).toBe('PENDING_CHECK_IN');
    // order: notification is posted before the backend create (notificationPostedAt is part of the create)
    expect(h.backend.callsOf('createRequest')[0]?.body).toMatchObject({ notificationStatus: 'POSTED' });
    expect(h.backend.notificationEvents.map((e) => e.type)).toEqual(['POSTED']);
  });

  it('DS2 #4/#5 EXIT while checked in → CHECK_OUT request', async () => {
    const h = makeDeps();
    await h.seed({ openSession: true });
    const out = await exit(h);
    expect(out).toMatchObject({ kind: 'REQUEST_CREATED', type: 'CHECK_OUT' });
  });

  it('ignores transitions that do not change the state (EXIT while checked out, ENTER while checked in)', async () => {
    const h = makeDeps();
    await h.seed();
    expect(await exit(h)).toEqual({ kind: 'IGNORED', reason: 'NO_STATE_CHANGE' });

    const h2 = makeDeps();
    await h2.seed({ openSession: true });
    expect(await enter(h2)).toEqual({ kind: 'IGNORED', reason: 'NO_STATE_CHANGE' });
    expect(h2.store.events.some((e) => e.type === 'TRANSITION_IGNORED')).toBe(true);
    expect(h2.backend.callsOf('createRequest')).toHaveLength(0);
  });

  it('ignores a repeated ENTER while the check-in is already pending', async () => {
    const h = makeDeps();
    await h.seed();
    await enter(h);
    expect(await enter(h)).toEqual({ kind: 'IGNORED', reason: 'NO_STATE_CHANGE' });
    expect(h.backend.callsOf('createRequest')).toHaveLength(1);
  });

  it('DS2 #3 EXIT during pending check-in + fresh Confirmed Outside → request cancelled', async () => {
    const h = makeDeps();
    await h.seed();
    const created = (await enter(h)) as { requestId: string };
    h.clock.advance(60_000);
    h.location.next(OUTSIDE);

    const out = await exit(h);
    expect(out).toEqual({ kind: 'PENDING_CANCELLED', requestId: created.requestId, queued: false });
    expect((await h.store.getRequest(created.requestId))?.status).toBe('CANCELLED');
    expect(h.backend.requests.get(created.requestId)?.status).toBe('CANCELLED');
    expect(h.scheduler.jobs.has(created.requestId)).toBe(false);
    expect(h.notifier.dismissed).toContain(created.requestId);
    expect((await getLocalView(h.deps)).state).toBe('CHECKED_OUT');
  });

  it('DS2 #7 EXIT during pending check-in but the fresh fix is UNCERTAIN → request kept', async () => {
    const h = makeDeps();
    await h.seed();
    const created = (await enter(h)) as { requestId: string };
    h.location.next(BOUNDARY);
    const out = await exit(h);
    expect(out).toMatchObject({ kind: 'PENDING_KEPT', classification: 'UNCERTAIN' });
    expect((await h.store.getRequest(created.requestId))?.status).toBe('ACTIVE');
    expect(h.backend.callsOf('cancel')).toHaveLength(0);
  });

  it('DS2 #6 ENTER during pending check-out + fresh Confirmed Inside → cancelled, session stays open', async () => {
    const h = makeDeps();
    await h.seed({ openSession: true });
    const created = (await exit(h)) as { requestId: string };
    h.location.next(INSIDE);
    const out = await enter(h);
    expect(out).toMatchObject({ kind: 'PENDING_CANCELLED', requestId: created.requestId });
    expect(h.backend.openSession).not.toBeNull();
    expect((await getLocalView(h.deps)).state).toBe('CHECKED_IN');
  });

  it('DS2 #13 notification cannot be posted → request recorded with notificationStatus FAILED (no auto later)', async () => {
    const h = makeDeps();
    await h.seed();
    h.notifier.fail = true;
    const out = await enter(h);
    expect(out).toMatchObject({ kind: 'REQUEST_CREATED', notification: 'FAILED' });
    const id = (out as { requestId: string }).requestId;
    expect(h.backend.requests.get(id)).toMatchObject({ notificationStatus: 'FAILED', notificationPostedAt: null });
    expect(h.scheduler.jobs.has(id)).toBe(true); // the job will record UNRESOLVED / NOTIFICATION_FAILED
  });

  it('DS2 #14 offline → request saved locally and queued in the outbox (Pending synchronization)', async () => {
    const h = makeDeps();
    await h.seed();
    h.backend.offline = true;
    const out = await enter(h);
    expect(out).toMatchObject({ kind: 'REQUEST_CREATED', sync: 'PENDING_SYNC' });
    const id = (out as { requestId: string }).requestId;
    expect(h.store.outbox.map((e) => [e.kind, e.idempotencyKey])).toEqual([
      ['CREATE_REQUEST', id],
      ['NOTIFICATION_EVENT', expect.any(String)],
    ]);
    expect(h.scheduler.syncScheduled).toBeGreaterThan(0);
    expect(h.scheduler.jobs.has(id)).toBe(true);
  });

  it('DS2 #11 backend refuses CHECK_OUT without an open session (stale local state) → request rejected', async () => {
    const h = makeDeps();
    await h.seed({ openSession: true });
    h.backend.openSession = null; // closed on the server (e.g. by an administrator)
    const out = await exit(h);
    expect(out).toMatchObject({ kind: 'REQUEST_REFUSED', code: 'NO_OPEN_SESSION' });
    const id = (out as { requestId: string }).requestId;
    expect(await h.store.getRequest(id)).toMatchObject({ status: 'REJECTED', syncStatus: 'FAILED' });
    expect(h.scheduler.jobs.has(id)).toBe(false);
    expect(h.notifier.dismissed).toContain(id);
  });

  it('ignores transitions when signed out', async () => {
    const h = makeDeps();
    await h.seed();
    h.session.tokens = null;
    expect(await enter(h)).toEqual({ kind: 'IGNORED', reason: 'SIGNED_OUT' });
  });

  it('DS2 #20 uses the config version of the geofence that fired', async () => {
    const h = makeDeps();
    await h.seed();
    h.backend.configs.set(2, { ...h.cfg, version: 2, radiusM: 300 });
    h.backend.activeVersion = 2;
    await h.store.saveConfig({ ...h.cfg, version: 2, radiusM: 300 });
    await h.store.setMeta('activeConfigVersion', '2');
    const out = await enter(h); // region faculty-v1
    const id = (out as { requestId: string }).requestId;
    expect((await h.store.getRequest(id))?.configVersion).toBe(1);
  });

  it('evaluates an overdue pending request before handling a new transition', async () => {
    const h = makeDeps();
    await h.seed();
    const first = (await enter(h)) as { requestId: string };
    h.clock.advance(10 * 60_000); // grace job never ran
    h.location.next(INSIDE);
    await enter(h);
    expect(h.backend.results.get(first.requestId)?.status).toBe('APPROVED');
  });

  it('treats a create rejected with 409 ACTIVE_REQUEST_EXISTS as refused', async () => {
    const h = makeDeps();
    await h.seed();
    h.backend.failNext('createRequest', new ApiRequestError(409, 'ACTIVE_REQUEST_EXISTS', 'active'));
    const out = await enter(h);
    expect(out).toMatchObject({ kind: 'REQUEST_REFUSED', code: 'ACTIVE_REQUEST_EXISTS' });
  });
});
