import { randomUUID } from 'node:crypto';
import {
  actor,
  autoBody,
  BOUNDARY,
  checkIn,
  confirmBody,
  createRequest,
  createTestApp,
  evidence,
  GRACE_MS,
  INSIDE,
  OUTSIDE,
  resetDb,
  type Actor,
  type TestContext,
} from './helpers';

/** DS2 §3.6 functional scenarios that the backend is responsible for. */
describe('Attendance processing (e2e)', () => {
  let ctx: TestContext;
  let staff: Actor;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.close());
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    ctx.clock.set('2026-11-03T01:00:00Z'); // 08:00 Asia/Bangkok
    staff = await actor(ctx);
  });

  it('scenario 1: entry followed by manual confirmation records one manual check-in', async () => {
    const { requestId, res } = await createRequest(ctx, staff, 'CHECK_IN');
    expect(res.status).toBe(201);
    expect(Date.parse(res.body.deadlineAt) - ctx.clock.now().getTime()).toBe(GRACE_MS);

    const r = await staff.post(`/attendance/requests/${requestId}/confirm`, confirmBody(ctx, INSIDE), requestId);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'APPROVED', method: 'MANUAL', classification: 'CONFIRMED_INSIDE' });
    expect(r.body.officialTime).toBe(ctx.clock.now().toISOString());

    const state = await staff.get('/attendance/state');
    expect(state.body.state).toBe('CHECKED_IN');
    expect(state.body.openSession.checkInMethod).toBe('MANUAL');
    expect(await ctx.prisma.attendanceSession.count()).toBe(1);
  });

  it('scenario 2: no response + valid Inside reading after timeout records one automatic check-in', async () => {
    const { requestId } = await createRequest(ctx, staff, 'CHECK_IN');
    ctx.clock.advance(GRACE_MS + 1_000);
    const r = await staff.post(`/attendance/requests/${requestId}/auto`, autoBody(ctx, INSIDE), requestId);
    expect(r.body).toMatchObject({ status: 'APPROVED', method: 'AUTOMATIC' });
    // Official time is the server approval time, not backdated to the boundary crossing.
    expect(r.body.officialTime).toBe(ctx.clock.now().toISOString());
  });

  it('automatic submission before the grace period expires is refused and stays pending', async () => {
    const { requestId } = await createRequest(ctx, staff, 'CHECK_IN');
    ctx.clock.advance(60_000);
    const r = await staff.post(`/attendance/requests/${requestId}/auto`, autoBody(ctx, INSIDE), requestId);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('GRACE_PERIOD_NOT_EXPIRED');
    expect((await staff.get('/attendance/state')).body.state).toBe('PENDING_CHECK_IN');
  });

  it('timeout + confirmed outside cancels the check-in (no attendance)', async () => {
    const { requestId } = await createRequest(ctx, staff, 'CHECK_IN');
    ctx.clock.advance(GRACE_MS);
    const r = await staff.post(`/attendance/requests/${requestId}/auto`, autoBody(ctx, OUTSIDE), requestId);
    expect(r.body).toMatchObject({ status: 'CANCELLED', reason: 'CONFIRMED_OPPOSITE_SIDE', sessionId: null });
    expect(await ctx.prisma.attendanceSession.count()).toBe(0);
  });

  it('scenario 3: confirmed exit before timeout cancels the pending check-in', async () => {
    const { requestId } = await createRequest(ctx, staff, 'CHECK_IN');
    ctx.clock.advance(60_000);
    const now = ctx.clock.now().toISOString();
    const r = await staff.post(
      `/attendance/requests/${requestId}/cancel`,
      { reason: 'CONFIRMED_OPPOSITE_SIDE', clientRecordedAt: now, evidence: evidence(ctx, OUTSIDE) },
      requestId,
    );
    expect(r.body.status).toBe('CANCELLED');
    expect((await staff.get('/attendance/state')).body.state).toBe('CHECKED_OUT');
  });

  it('cancel is refused when the fresh fix does not confirm the opposite side', async () => {
    const { requestId } = await createRequest(ctx, staff, 'CHECK_IN');
    const now = ctx.clock.now().toISOString();
    const r = await staff.post(
      `/attendance/requests/${requestId}/cancel`,
      { reason: 'CONFIRMED_OPPOSITE_SIDE', clientRecordedAt: now, evidence: evidence(ctx, BOUNDARY, 20) },
      requestId,
    );
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('LOCATION_NOT_CONFIRMED');
    // the evidence explaining the refusal is kept
    expect(await ctx.prisma.locationEvidence.count({ where: { requestId } })).toBe(1);
  });

  it('scenarios 4–5: exit + manual check-out, and a later day exit + automatic check-out', async () => {
    await checkIn(ctx, staff);
    ctx.clock.advance(8 * 3_600_000);
    const out = await createRequest(ctx, staff, 'CHECK_OUT');
    expect(out.res.status).toBe(201);
    const r = await staff.post(`/attendance/requests/${out.requestId}/confirm`, confirmBody(ctx, OUTSIDE), out.requestId);
    expect(r.body).toMatchObject({ status: 'APPROVED', method: 'MANUAL' });
    const session = await ctx.prisma.attendanceSession.findFirstOrThrow();
    expect(session).toMatchObject({ status: 'COMPLETED', checkInMethod: 'MANUAL', checkOutMethod: 'MANUAL' });

    // Next day: manual check-in, automatic check-out — one session keeps separate methods (DS2 §2.9.2).
    ctx.clock.advance(16 * 3_600_000);
    await checkIn(ctx, staff);
    ctx.clock.advance(8 * 3_600_000);
    const out2 = await createRequest(ctx, staff, 'CHECK_OUT');
    ctx.clock.advance(GRACE_MS);
    const a = await staff.post(`/attendance/requests/${out2.requestId}/auto`, autoBody(ctx, OUTSIDE), out2.requestId);
    expect(a.body).toMatchObject({ status: 'APPROVED', method: 'AUTOMATIC' });
    const s2 = await ctx.prisma.attendanceSession.findUniqueOrThrow({ where: { id: a.body.sessionId } });
    expect(s2).toMatchObject({ checkInMethod: 'MANUAL', checkOutMethod: 'AUTOMATIC', status: 'COMPLETED' });
  });

  it('scenario 6: confirmed return before timeout cancels the pending check-out; session stays open', async () => {
    await checkIn(ctx, staff);
    const out = await createRequest(ctx, staff, 'CHECK_OUT');
    const now = ctx.clock.now().toISOString();
    const r = await staff.post(
      `/attendance/requests/${out.requestId}/cancel`,
      { reason: 'CONFIRMED_OPPOSITE_SIDE', clientRecordedAt: now, evidence: evidence(ctx, INSIDE) },
      out.requestId,
    );
    expect(r.body.status).toBe('CANCELLED');
    expect((await staff.get('/attendance/state')).body.state).toBe('CHECKED_IN');
  });

  it('scenario 7: uncertain location near the boundary is never approved', async () => {
    const { requestId } = await createRequest(ctx, staff, 'CHECK_IN');
    const manual = await staff.post(`/attendance/requests/${requestId}/confirm`, confirmBody(ctx, BOUNDARY, 20), requestId);
    expect(manual.status).toBe(422);
    expect(manual.body).toMatchObject({ code: 'LOCATION_NOT_CONFIRMED', details: { classification: 'UNCERTAIN' } });

    ctx.clock.advance(GRACE_MS);
    const auto = await staff.post(`/attendance/requests/${requestId}/auto`, autoBody(ctx, BOUNDARY, 20), requestId);
    expect(auto.body).toMatchObject({ status: 'UNRESOLVED', reason: 'UNCERTAIN_LOCATION' });
    expect(await ctx.prisma.attendanceSession.count()).toBe(0);
  });

  it('scenario 8: old or low-quality readings are UNCERTAIN on the server, whatever the client claims', async () => {
    const { requestId } = await createRequest(ctx, staff, 'CHECK_IN');
    ctx.clock.advance(GRACE_MS);
    const stale = autoBody(ctx, INSIDE, 10, 120);
    const r = await staff.post(
      `/attendance/requests/${requestId}/auto`,
      { ...stale, evidence: { ...stale.evidence, clientClassification: 'CONFIRMED_INSIDE' } },
      requestId,
    );
    expect(r.body).toMatchObject({ status: 'UNRESOLVED', classification: 'UNCERTAIN' });

    const second = await createRequest(ctx, staff, 'CHECK_IN');
    const low = await staff.post(`/attendance/requests/${second.requestId}/confirm`, confirmBody(ctx, 0, 45), second.requestId);
    expect(low.status).toBe(422);
  });

  it('scenario 9: repeated submission of the same request produces no duplicate action', async () => {
    const { requestId } = await createRequest(ctx, staff, 'CHECK_IN');
    const again = await createRequest(ctx, staff, 'CHECK_IN', { requestId });
    expect(again.res.status).toBe(200);
    const body = confirmBody(ctx, INSIDE);
    const results = [];
    for (let i = 0; i < 10; i++) results.push(await staff.post(`/attendance/requests/${requestId}/confirm`, body, requestId));
    expect(new Set(results.map((r) => r.body.sessionId)).size).toBe(1);
    expect(results.every((r) => r.status === 200 && r.body.status === 'APPROVED')).toBe(true);
    expect(await ctx.prisma.attendanceSession.count()).toBe(1);
  });

  it('scenario 10: manual and automatic arriving together — only one action succeeds', async () => {
    const { requestId } = await createRequest(ctx, staff, 'CHECK_IN');
    ctx.clock.advance(GRACE_MS);
    const [m, a, m2, a2] = await Promise.all([
      staff.post(`/attendance/requests/${requestId}/confirm`, confirmBody(ctx, INSIDE), requestId),
      staff.post(`/attendance/requests/${requestId}/auto`, autoBody(ctx, INSIDE), requestId),
      staff.post(`/attendance/requests/${requestId}/confirm`, confirmBody(ctx, INSIDE), requestId),
      staff.post(`/attendance/requests/${requestId}/auto`, autoBody(ctx, INSIDE), requestId),
    ]);
    for (const r of [m, a, m2, a2]) expect(r.status).toBe(200);
    const sessions = new Set([m, a, m2, a2].map((r) => r.body.sessionId));
    expect(sessions.size).toBe(1);
    expect(new Set([m, a, m2, a2].map((r) => r.body.method)).size).toBe(1);
    expect(await ctx.prisma.attendanceSession.count()).toBe(1);
  });

  it('scenario 11: check-out without an open session is rejected', async () => {
    const r = await createRequest(ctx, staff, 'CHECK_OUT');
    expect(r.res.status).toBe(409);
    expect(r.res.body.code).toBe('NO_OPEN_SESSION');
  });

  it('check-in while a session is open is rejected', async () => {
    await checkIn(ctx, staff);
    const r = await createRequest(ctx, staff, 'CHECK_IN');
    expect(r.res.body.code).toBe('SESSION_ALREADY_OPEN');
  });

  it('scenario 13: a request whose notification failed is never automated', async () => {
    const { requestId } = await createRequest(ctx, staff, 'CHECK_IN', { notificationStatus: 'FAILED' });
    ctx.clock.advance(GRACE_MS);
    const r = await staff.post(`/attendance/requests/${requestId}/auto`, autoBody(ctx, INSIDE), requestId);
    expect(r.body).toMatchObject({ status: 'UNRESOLVED', reason: 'NOTIFICATION_FAILED' });
  });

  it('mock locations are rejected and flagged', async () => {
    const { requestId } = await createRequest(ctx, staff, 'CHECK_IN');
    ctx.clock.advance(GRACE_MS);
    const r = await staff.post(`/attendance/requests/${requestId}/auto`, autoBody(ctx, INSIDE, 5, 5, true), requestId);
    expect(r.body).toMatchObject({ status: 'REJECTED', reason: 'MOCK_LOCATION' });
  });

  it('only one active request per user; an expired one is superseded', async () => {
    const first = await createRequest(ctx, staff, 'CHECK_IN');
    const second = await createRequest(ctx, staff, 'CHECK_IN');
    expect(second.res.status).toBe(409);
    expect(second.res.body.code).toBe('ACTIVE_REQUEST_EXISTS');

    ctx.clock.advance(GRACE_MS + 1);
    const third = await createRequest(ctx, staff, 'CHECK_IN');
    expect(third.res.status).toBe(201);
    const old = await ctx.prisma.attendanceRequest.findUniqueOrThrow({ where: { id: first.requestId } });
    expect(old).toMatchObject({ status: 'UNRESOLVED', resolutionReason: 'SUPERSEDED' });
  });

  it('client may report unresolved; a finished request keeps its result', async () => {
    const { requestId } = await createRequest(ctx, staff, 'CHECK_IN');
    const now = ctx.clock.now().toISOString();
    const r = await staff.post(`/attendance/requests/${requestId}/unresolved`, { reason: 'LOCATION_UNAVAILABLE', clientRecordedAt: now }, requestId);
    expect(r.body).toMatchObject({ status: 'UNRESOLVED', reason: 'LOCATION_UNAVAILABLE' });
    const late = await staff.post(`/attendance/requests/${requestId}/confirm`, confirmBody(ctx, INSIDE), requestId);
    expect(late.body.status).toBe('UNRESOLVED');
    const history = await staff.get('/attendance/history?from=2026-11-03&to=2026-11-03');
    expect(history.body.issues).toHaveLength(1);
  });

  it('scenario 16: staff cannot touch another user\'s request (404) or admin endpoints (403)', async () => {
    const other = await actor(ctx);
    const { requestId } = await createRequest(ctx, other, 'CHECK_IN');
    const r = await staff.post(`/attendance/requests/${requestId}/confirm`, confirmBody(ctx, INSIDE), requestId);
    expect(r.status).toBe(404);
    expect((await staff.get('/admin/attendance/sessions?from=2026-11-01&to=2026-11-03')).status).toBe(403);
    expect((await staff.get('/admin/users')).status).toBe(403);
  });

  it('scenario 17: a deactivated account cannot submit attendance', async () => {
    const { requestId } = await createRequest(ctx, staff, 'CHECK_IN');
    await ctx.prisma.user.update({ where: { id: staff.user.id }, data: { status: 'DEACTIVATED' } });
    const r = await staff.post(`/attendance/requests/${requestId}/confirm`, confirmBody(ctx, INSIDE), requestId);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('ACCOUNT_INACTIVE');
  });

  it('scenario 20: a pending request keeps its original configuration version', async () => {
    const { requestId } = await createRequest(ctx, staff, 'CHECK_IN');
    const sa = await actor(ctx, 'SYSTEM_ADMIN');
    const put = await sa.put('/admin/geofence/config', {
      name: 'Tighter',
      centerLat: 14.0693,
      centerLng: 100.6035,
      radiusM: 30,
      gracePeriodSec: 120,
      maxLocationAgeSec: 60,
      maxAccuracyM: 30,
      reason: 'Field test with a smaller radius',
    });
    expect(put.body.version).toBe(2);
    expect((await staff.get('/geofence/config/active')).body.version).toBe(2);
    expect((await staff.get('/geofence/config/1')).body.radiusM).toBe(150);

    // 50 m north: inside v1 (150 m) but outside v2 (30 m). The request still uses v1.
    const r = await staff.post(`/attendance/requests/${requestId}/confirm`, confirmBody(ctx, INSIDE), requestId);
    expect(r.body.status).toBe('APPROVED');
    expect((await ctx.prisma.attendanceRequest.findUniqueOrThrow({ where: { id: requestId } })).configVersion).toBe(1);
  });

  it('validates bodies and the idempotency key', async () => {
    const id = randomUUID();
    const bad = await staff.post('/attendance/requests', { requestId: id, type: 'CHECK_IN' }, id);
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');

    const { requestId } = await createRequest(ctx, staff, 'CHECK_IN');
    const mismatch = await staff.post(`/attendance/requests/${requestId}/confirm`, confirmBody(ctx, INSIDE), randomUUID());
    expect(mismatch.body.code).toBe('IDEMPOTENCY_KEY_MISMATCH');
  });

  it('records notification events for evaluation', async () => {
    const { requestId } = await createRequest(ctx, staff, 'CHECK_IN');
    const r = await staff.post('/notification-events', {
      requestId,
      type: 'RESPONDED',
      occurredAt: ctx.clock.now().toISOString(),
      action: 'CHECK_IN',
    });
    expect(r.status).toBe(200);
    expect(await ctx.prisma.notificationEvent.count()).toBe(1);
  });
});
