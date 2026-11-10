import { ApiRequestError, AuthRequiredError, NetworkError } from '../src/domain/errors';
import { bootstrap, login, logout } from '../src/domain/useCases/auth';
import { handleGeofenceTransition } from '../src/domain/useCases/handleGeofenceTransition';
import { ensureMonitoring } from '../src/domain/useCases/monitoring';
import { __resetSyncForTests } from '../src/domain/useCases/syncOutbox';
import { makeDeps, STAFF } from './fakes/makeDeps';

beforeEach(() => __resetSyncForTests());

describe('login / logout / bootstrap', () => {
  it('STAFF login stores tokens, caches the config and registers the geofence', async () => {
    const h = makeDeps();
    h.session.tokens = null;
    h.session.user = null;
    const out = await login(h.deps, 'staff@siit.tu.ac.th', 'Staff1234');
    expect(out).toMatchObject({ kind: 'OK', monitoring: { active: true, geofenceRegistered: true, configVersion: 1 } });
    expect((await h.session.getTokens())?.accessToken).toBe('access-1');
    expect(h.geofence.running?.version).toBe(1);
    expect(await h.store.getConfig(1)).not.toBeNull();
  });

  it('non-STAFF login → "use the Admin Web", no tokens kept, no monitoring', async () => {
    const h = makeDeps();
    h.session.tokens = null;
    h.authApi.loginUser = { ...STAFF, role: 'ATTENDANCE_ADMIN' };
    const out = await login(h.deps, 'attendance.admin@siit.tu.ac.th', 'Admin1234');
    expect(out).toEqual({ kind: 'NOT_STAFF', role: 'ATTENDANCE_ADMIN' });
    expect(h.session.tokens).toBeNull();
    expect(h.geofence.running).toBeNull();
    expect(h.authApi.loggedOut).toEqual(['refresh-1']);
  });

  it('maps login errors to generic messages', async () => {
    const h = makeDeps();
    h.authApi.login = async () => {
      throw new ApiRequestError(401, 'INVALID_CREDENTIALS', 'x');
    };
    expect(await login(h.deps, 'a@b.c', 'x')).toEqual({ kind: 'INVALID_CREDENTIALS' });
    h.authApi.login = async () => {
      throw new ApiRequestError(423, 'ACCOUNT_LOCKED', 'x');
    };
    expect(await login(h.deps, 'a@b.c', 'x')).toEqual({ kind: 'ACCOUNT_LOCKED' });
  });

  it('DS2 #12 missing background location → monitoring NOT active and the gap is reported', async () => {
    const h = makeDeps();
    await h.seed();
    h.setPermissions({ backgroundLocation: false });
    const status = await ensureMonitoring(h.deps, h.cfg);
    expect(status).toMatchObject({ active: false, geofenceRegistered: false, missing: ['BACKGROUND_LOCATION'] });
    expect(h.geofence.running).toBeNull();
  });

  it('missing notification permission → geofence registered but monitoring not reported as active', async () => {
    const h = makeDeps();
    await h.seed();
    h.setPermissions({ notifications: false });
    const status = await ensureMonitoring(h.deps, h.cfg);
    expect(status).toMatchObject({ active: false, geofenceRegistered: true, missing: ['NOTIFICATIONS'] });
  });

  it('DS2 #19 logout with an open session warns first; confirming keeps the session open (no auto check-out)', async () => {
    const h = makeDeps();
    await h.seed({ openSession: true });
    await h.geofence.start(h.cfg);

    const warn = await logout(h.deps, { confirmed: false });
    expect(warn).toMatchObject({ kind: 'NEEDS_CONFIRMATION', openSession: { id: 'session-0' } });
    expect(h.session.tokens).not.toBeNull();

    const done = await logout(h.deps, { confirmed: true });
    expect(done).toEqual({ kind: 'LOGGED_OUT', discardedUnsynced: 0 });
    expect(h.geofence.running).toBeNull();
    expect(h.scheduler.log).toContain('cancelAll');
    expect(h.notifier.dismissedAll).toBe(1);
    expect(h.session.tokens).toBeNull();
    expect(h.authApi.loggedOut).toEqual(['refresh-1']);
    // no automatic check-out was sent: the session stays open on the backend
    expect(h.backend.openSession).not.toBeNull();
    expect(h.backend.callsOf('createRequest')).toHaveLength(0);
    // later transitions are ignored
    expect(await handleGeofenceTransition(h.deps, { transition: 'EXIT', detectedAt: h.clock.now().toISOString() })).toEqual({
      kind: 'IGNORED',
      reason: 'SIGNED_OUT',
    });
  });

  it('logout without an open session needs no confirmation', async () => {
    const h = makeDeps();
    await h.seed();
    expect(await logout(h.deps, { confirmed: false })).toMatchObject({ kind: 'LOGGED_OUT' });
  });

  it('logout cancels pending grace jobs of an open request', async () => {
    const h = makeDeps();
    await h.seed();
    await handleGeofenceTransition(h.deps, { transition: 'ENTER', regionId: 'faculty-v1', detectedAt: h.clock.now().toISOString() });
    expect(h.scheduler.jobs.size).toBe(1);
    expect(await logout(h.deps, { confirmed: false })).toMatchObject({ kind: 'NEEDS_CONFIRMATION', pendingRequest: true });
    await logout(h.deps, { confirmed: true });
    expect(h.scheduler.jobs.size).toBe(0);
  });

  it('bootstrap re-registers the geofence when the config version changed and re-schedules pending jobs', async () => {
    const h = makeDeps();
    await h.seed();
    await ensureMonitoring(h.deps, h.cfg);
    const created = await handleGeofenceTransition(h.deps, { transition: 'ENTER', regionId: 'faculty-v1', detectedAt: h.clock.now().toISOString() });
    const id = (created as { requestId: string }).requestId;
    h.scheduler.jobs.clear(); // e.g. after reboot
    h.backend.configs.set(2, { ...h.cfg, version: 2, radiusM: 200 });
    h.backend.activeVersion = 2;

    const out = await bootstrap(h.deps, { reason: 'BOOT' });
    expect(out).toMatchObject({ kind: 'SIGNED_IN', online: true, monitoring: { active: true, configVersion: 2 } });
    expect(h.geofence.running?.version).toBe(2);
    expect(h.scheduler.jobs.has(id)).toBe(true);
    // the pending request keeps version 1
    expect((await h.store.getRequest(id))?.configVersion).toBe(1);
  });

  it('bootstrap with a rejected refresh token signs out and stops monitoring', async () => {
    const h = makeDeps();
    await h.seed();
    await h.geofence.start(h.cfg);
    h.authApi.me = async () => {
      throw new AuthRequiredError();
    };
    expect(await bootstrap(h.deps, { reason: 'APP_START' })).toEqual({ kind: 'SIGNED_OUT' });
    expect(h.geofence.running).toBeNull();
    expect(h.session.tokens).toBeNull();
  });

  it('bootstrap offline keeps the cached session and config', async () => {
    const h = makeDeps();
    await h.seed();
    h.backend.offline = true;
    h.authApi.me = async () => {
      throw new NetworkError();
    };
    expect(await bootstrap(h.deps, { reason: 'APP_START' })).toMatchObject({ kind: 'SIGNED_IN', online: false, monitoring: { configVersion: 1 } });
  });
});
