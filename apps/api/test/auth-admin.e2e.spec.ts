import { randomUUID } from 'node:crypto';
import { JobsService } from '../src/jobs/jobs.service';
import {
  actor,
  checkIn,
  createRequest,
  createTestApp,
  createUser,
  GRACE_MS,
  login,
  PASSWORD,
  resetDb,
  type TestContext,
} from './helpers';

describe('Auth, accounts and administration (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.close());
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    ctx.clock.set(new Date());
  });

  describe('auth (FR01)', () => {
    it('logs in, returns the profile and a working access token', async () => {
      const u = await createUser(ctx.prisma);
      const s = await login(ctx, u.email.toUpperCase());
      const me = await ctx.http.get('/api/v1/me').set('Authorization', `Bearer ${s.tokens.accessToken}`);
      expect(me.body).toMatchObject({ email: u.email, role: 'STAFF', status: 'ACTIVE' });
      expect(me.body.passwordHash).toBeUndefined();
    });

    it('uses one generic message for unknown email and wrong password', async () => {
      const u = await createUser(ctx.prisma);
      const a = await ctx.http.post('/api/v1/auth/login').send({ email: 'nobody@siit.tu.ac.th', password: 'x' });
      const b = await ctx.http.post('/api/v1/auth/login').send({ email: u.email, password: 'wrong' });
      expect(a.status).toBe(401);
      expect(b.status).toBe(401);
      expect(a.body).toEqual(b.body);
    });

    it('locks the account after 5 failures and unlocks after the lock period', async () => {
      const u = await createUser(ctx.prisma);
      for (let i = 0; i < 5; i++) await ctx.http.post('/api/v1/auth/login').send({ email: u.email, password: 'wrong' });
      const locked = await ctx.http.post('/api/v1/auth/login').send({ email: u.email, password: PASSWORD });
      expect(locked.status).toBe(423);
      expect(locked.body.code).toBe('ACCOUNT_LOCKED');
      ctx.clock.advance(16 * 60_000);
      await login(ctx, u.email);
    });

    it('rejects inactive accounts at login', async () => {
      const u = await createUser(ctx.prisma, { status: 'DEACTIVATED' });
      const r = await ctx.http.post('/api/v1/auth/login').send({ email: u.email, password: PASSWORD });
      expect(r.status).toBe(403);
    });

    it('rotates refresh tokens and detects re-use', async () => {
      const u = await createUser(ctx.prisma);
      const s = await login(ctx, u.email);
      const r1 = await ctx.http.post('/api/v1/auth/refresh').send({ refreshToken: s.tokens.refreshToken });
      expect(r1.status).toBe(200);
      const reuse = await ctx.http.post('/api/v1/auth/refresh').send({ refreshToken: s.tokens.refreshToken });
      expect(reuse.status).toBe(401);
      // re-use revoked the whole family, including the newest token
      const r2 = await ctx.http.post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken });
      expect(r2.status).toBe(401);
    });

    it('logout revokes the refresh token', async () => {
      const u = await createUser(ctx.prisma);
      const s = await login(ctx, u.email);
      await ctx.http.post('/api/v1/auth/logout').send({ refreshToken: s.tokens.refreshToken }).expect(200);
      expect((await ctx.http.post('/api/v1/auth/refresh').send({ refreshToken: s.tokens.refreshToken })).status).toBe(401);
    });

    it('rejects requests without a valid token', async () => {
      expect((await ctx.http.get('/api/v1/attendance/state')).status).toBe(401);
      expect((await ctx.http.get('/api/v1/attendance/state').set('Authorization', 'Bearer nope')).status).toBe(401);
    });

    it('password reset: single-use, time-limited link; old sessions are revoked', async () => {
      const u = await createUser(ctx.prisma);
      const s = await login(ctx, u.email);
      await ctx.http.post('/api/v1/auth/password/forgot').send({ email: u.email }).expect(200);
      await ctx.http.post('/api/v1/auth/password/forgot').send({ email: 'unknown@siit.tu.ac.th' }).expect(200);
      const mail = ctx.mail.outbox.at(-1)!;
      expect(mail.to).toBe(u.email);
      const token = /token=([\w-]+)/.exec(mail.text)![1];

      await ctx.http.post('/api/v1/auth/password/reset').send({ token, password: 'NewPassw0rd' }).expect(200);
      expect((await ctx.http.post('/api/v1/auth/password/reset').send({ token, password: 'NewPassw0rd2' })).status).toBe(400);
      expect((await ctx.http.post('/api/v1/auth/refresh').send({ refreshToken: s.tokens.refreshToken })).status).toBe(401);
      await login(ctx, u.email, 'NewPassw0rd');
    });
  });

  describe('accounts (System Administrator)', () => {
    it('creates a user, sends an activation link, and activation enables login', async () => {
      const sa = await actor(ctx, 'SYSTEM_ADMIN');
      const r = await sa.post('/admin/users', {
        staffId: 'N1001',
        email: 'New.Lecturer@siit.tu.ac.th',
        fullName: 'New Lecturer',
        department: 'School of ICT',
        role: 'STAFF',
      });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ email: 'new.lecturer@siit.tu.ac.th', status: 'PENDING_ACTIVATION' });
      const dup = await sa.post('/admin/users', { staffId: 'N1001', email: 'x@siit.tu.ac.th', fullName: 'X', department: 'Y', role: 'STAFF' });
      expect(dup.status).toBe(409);

      const token = /activate\?token=([\w-]+)/.exec(ctx.mail.outbox.at(-1)!.text)![1];
      expect((await ctx.http.post('/api/v1/auth/activate').send({ token, password: 'weak' })).status).toBe(400);
      await ctx.http.post('/api/v1/auth/activate').send({ token, password: 'Lecturer123' }).expect(200);
      await login(ctx, 'new.lecturer@siit.tu.ac.th', 'Lecturer123');
    });

    it('deactivation revokes sessions immediately and is audited; admins cannot lock themselves out', async () => {
      const sa = await actor(ctx, 'SYSTEM_ADMIN');
      const staff = await actor(ctx);
      const r = await sa.patch(`/admin/users/${staff.user.id}`, { status: 'DEACTIVATED' });
      expect(r.body.status).toBe('DEACTIVATED');
      expect((await staff.get('/attendance/state')).status).toBe(403);
      expect((await ctx.http.post('/api/v1/auth/refresh').send({ refreshToken: staff.tokens.refreshToken })).status).toBe(401);
      expect(await ctx.prisma.auditLog.count({ where: { action: 'USER_DEACTIVATED', entityId: staff.user.id } })).toBe(1);

      expect((await sa.patch(`/admin/users/${sa.user.id}`, { status: 'DEACTIVATED' })).status).toBe(403);
    });

    it('enforces role separation between the two admin roles', async () => {
      const aa = await actor(ctx, 'ATTENDANCE_ADMIN');
      const sa = await actor(ctx, 'SYSTEM_ADMIN');
      expect((await aa.get('/admin/users')).status).toBe(403);
      expect((await aa.put('/admin/geofence/config', {})).status).toBe(403);
      expect((await sa.get('/admin/attendance/sessions?from=2026-11-01&to=2026-11-02')).status).toBe(403);
      expect((await aa.get('/admin/dashboard/summary')).status).toBe(200);
      expect((await sa.get('/admin/dashboard/summary')).status).toBe(200);
      expect((await aa.get('/attendance/state')).status).toBe(403);
    });

    it('validates geofence changes (radius ≤ 1000 m, reason required)', async () => {
      const sa = await actor(ctx, 'SYSTEM_ADMIN');
      const base = { name: 'X', centerLat: 14, centerLng: 100, gracePeriodSec: 300, maxLocationAgeSec: 60, maxAccuracyM: 30, reason: 'test change' };
      expect((await sa.put('/admin/geofence/config', { ...base, radiusM: 1500 })).status).toBe(400);
      expect((await sa.put('/admin/geofence/config', { ...base, radiusM: 200, reason: '' })).status).toBe(400);
      const ok = await sa.put('/admin/geofence/config', { ...base, radiusM: 200 });
      expect(ok.body.version).toBe(2);
      const history = await sa.get('/admin/geofence/configs');
      expect(history.body.map((c: { version: number }) => c.version)).toEqual([2, 1]);
    });
  });

  describe('corrections & audit (FR09, scenario 18)', () => {
    it('staff requests a correction; admin approves; original and corrected values are auditable', async () => {
      ctx.clock.set('2026-11-03T01:00:00Z');
      const staff = await actor(ctx);
      const aa = await actor(ctx, 'ATTENDANCE_ADMIN');
      const sessionId = await checkIn(ctx, staff);

      const correctionId = randomUUID();
      const body = {
        correctionId,
        sessionId,
        workDate: '2026-11-03',
        requestedCheckInAt: '2026-11-03T00:45:00Z',
        requestedCheckOutAt: '2026-11-03T09:30:00Z',
        reason: 'Phone battery died before I left',
      };
      const created = await staff.post('/corrections', body, correctionId);
      expect(created.status).toBe(201);
      expect((await staff.post('/corrections', body, correctionId)).status).toBe(200); // idempotent
      expect((await staff.get('/corrections')).body).toHaveLength(1);

      const list = await aa.get('/admin/corrections?status=PENDING');
      expect(list.body.total).toBe(1);

      expect((await aa.post(`/admin/corrections/${correctionId}/review`, { decision: 'APPROVE', note: '' })).status).toBe(400);
      const reviewed = await aa.post(`/admin/corrections/${correctionId}/review`, { decision: 'APPROVE', note: 'Confirmed with head of school' });
      expect(reviewed.body).toMatchObject({ status: 'APPROVED', reviewer: { id: aa.user.id } });
      expect((await aa.post(`/admin/corrections/${correctionId}/review`, { decision: 'REJECT', note: 'again' })).status).toBe(409);

      const session = await ctx.prisma.attendanceSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(session).toMatchObject({
        status: 'COMPLETED',
        corrected: true,
        checkInMethod: 'ADMIN_CORRECTED',
        checkOutMethod: 'ADMIN_CORRECTED',
      });
      expect(session.originalCheckInAt?.toISOString()).toBe('2026-11-03T01:00:00.000Z');

      const audit = await aa.get(`/admin/audit-logs?entityType=AttendanceSession&entityId=${sessionId}&action=CORRECTION_APPROVED`);
      expect(audit.body.items).toHaveLength(1);
      expect(audit.body.items[0]).toMatchObject({
        actor: { id: aa.user.id },
        reason: 'Confirmed with head of school',
        previousValues: { checkInAt: '2026-11-03T01:00:00.000Z', checkOutAt: null },
        newValues: { checkInAt: '2026-11-03T00:45:00.000Z', checkOutAt: '2026-11-03T09:30:00.000Z' },
      });

      // Staff can see the record was corrected.
      const history = await staff.get('/attendance/history?from=2026-11-03&to=2026-11-03');
      expect(history.body.sessions[0].corrected).toBe(true);

      // The audit trail is append-only at the database level.
      await expect(ctx.prisma.auditLog.deleteMany({})).rejects.toThrow();
    });

    it('a staff member cannot attach a correction to someone else\'s session', async () => {
      const a = await actor(ctx);
      const b = await actor(ctx);
      const sessionId = await checkIn(ctx, a);
      const id = randomUUID();
      const r = await b.post('/corrections', {
        correctionId: id,
        sessionId,
        workDate: '2026-11-03',
        requestedCheckInAt: null,
        requestedCheckOutAt: '2026-11-03T09:30:00Z',
        reason: 'Not my session',
      }, id);
      expect(r.status).toBe(404);
    });

    it('admin direct edit requires a reason and rejects check-out before check-in', async () => {
      ctx.clock.set('2026-11-03T01:00:00Z');
      const staff = await actor(ctx);
      const aa = await actor(ctx, 'ATTENDANCE_ADMIN');
      const sessionId = await checkIn(ctx, staff);
      expect((await aa.patch(`/admin/attendance/sessions/${sessionId}`, { checkOutAt: '2026-11-03T09:00:00Z' })).status).toBe(400);
      expect((await aa.patch(`/admin/attendance/sessions/${sessionId}`, { checkOutAt: '2026-11-03T00:00:00Z', reason: 'typo' })).body.code).toBe('INVALID_TIME_RANGE');
      const ok = await aa.patch(`/admin/attendance/sessions/${sessionId}`, { checkOutAt: '2026-11-03T09:00:00Z', reason: 'Forgot to check out' });
      expect(ok.body).toMatchObject({ status: 'COMPLETED', checkOutMethod: 'ADMIN_CORRECTED', corrected: true, checkInMethod: 'MANUAL' });

      const sessions = await aa.get('/admin/attendance/sessions?from=2026-11-03&to=2026-11-03');
      expect(sessions.body.items[0].user.id).toBe(staff.user.id);
    });
  });

  describe('reports, dashboard and jobs', () => {
    it('exports attendance and evaluation CSV, and summarises today', async () => {
      ctx.clock.set('2026-11-03T01:00:00Z');
      const staff = await actor(ctx);
      const aa = await actor(ctx, 'ATTENDANCE_ADMIN');
      await checkIn(ctx, staff);

      const csv = await aa.get('/admin/reports/attendance.csv?from=2026-11-03&to=2026-11-03');
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain('2026-11-03 08:00'); // Bangkok time
      expect(csv.text.split('\r\n').filter(Boolean)).toHaveLength(2);

      const evalCsv = await aa.get('/admin/reports/evaluation.csv?from=2026-11-03&to=2026-11-03');
      expect(evalCsv.text).toContain('detectionToRecordSec');
      expect(evalCsv.text).toContain('CONFIRMED_INSIDE');

      const summary = await aa.get('/admin/dashboard/summary');
      expect(summary.body).toMatchObject({ date: '2026-11-03', checkedInNow: 1, checkedInToday: 1, manualActionsToday: 1 });
    });

    it('expireStaleRequests marks abandoned requests UNRESOLVED but never records attendance', async () => {
      const staff = await actor(ctx);
      const { requestId } = await createRequest(ctx, staff, 'CHECK_IN');
      const jobs = ctx.app.get(JobsService);
      expect(await jobs.expireStaleRequests()).toBe(0);
      ctx.clock.advance(GRACE_MS + 31 * 60_000);
      expect(await jobs.expireStaleRequests()).toBe(1);
      const r = await ctx.prisma.attendanceRequest.findUniqueOrThrow({ where: { id: requestId } });
      expect(r).toMatchObject({ status: 'UNRESOLVED', resolutionReason: 'NO_CLIENT_RESPONSE' });
      expect(await ctx.prisma.attendanceSession.count()).toBe(0);
    });

    it('flags sessions left open from a previous day', async () => {
      ctx.clock.set('2026-11-03T01:00:00Z');
      const staff = await actor(ctx);
      await checkIn(ctx, staff);
      ctx.clock.set('2026-11-04T02:00:00Z');
      expect(await ctx.app.get(JobsService).flagLongOpenSessions()).toBe(1);
      const aa = await actor(ctx, 'ATTENDANCE_ADMIN');
      expect((await aa.get('/admin/dashboard/summary')).body.longOpenSessions).toBe(1);
    });

    it('health check reports the database', async () => {
      expect((await ctx.http.get('/api/v1/health')).body).toEqual({ status: 'ok', db: 'up' });
    });
  });
});
