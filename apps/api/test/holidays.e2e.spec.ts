import { toBangkokDate } from '@attendance/shared';
import { actor, checkIn, confirmBody, createRequest, createTestApp, INSIDE, OUTSIDE, resetDb, type TestContext } from './helpers';

describe('Holiday calendar (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.close());
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    // A Monday morning in Bangkok (09:00 = 02:00 UTC).
    ctx.clock.set(new Date('2026-12-07T02:00:00Z'));
  });

  const today = () => toBangkokDate(ctx.clock.now());
  const addHoliday = (date: string, nameEn = 'Test holiday') =>
    ctx.prisma.holiday.create({ data: { date: new Date(`${date}T00:00:00Z`), nameEn, nameTh: 'วันหยุดทดสอบ', type: 'PUBLIC' } });

  it('lists holidays in a range for any signed-in user', async () => {
    await addHoliday('2026-12-07', 'Substitution day');
    await addHoliday('2026-12-10', 'Constitution Day');
    await addHoliday('2027-01-01', "New Year's Day");
    const staff = await actor(ctx, 'STAFF');
    const r = await staff.get('/calendar/holidays?from=2026-12-01&to=2026-12-31');
    expect(r.status).toBe(200);
    expect(r.body.holidays.map((h: { date: string }) => h.date)).toEqual(['2026-12-07', '2026-12-10']);
    expect(r.body.holidays[0]).toMatchObject({ nameEn: 'Substitution day', nameTh: 'วันหยุดทดสอบ', type: 'PUBLIC', note: null });
    expect((await staff.get('/calendar/holidays?from=2026-01-01&to=2027-12-31')).status).toBe(400); // over 400 days
    expect((await ctx.http.get('/api/v1/calendar/holidays?from=2026-12-01&to=2026-12-31')).status).toBe(401);
  });

  it('closes check-in on a holiday and reports it in the attendance state', async () => {
    await addHoliday(today(), 'Substitution day for National Father’s Day');
    const staff = await actor(ctx, 'STAFF');

    const state = await staff.get('/attendance/state');
    expect(state.body.todayHoliday).toMatchObject({ date: '2026-12-07', nameEn: 'Substitution day for National Father’s Day' });

    const { res } = await createRequest(ctx, staff, 'CHECK_IN');
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: 'HOLIDAY_CHECK_IN_CLOSED', details: { holiday: { date: '2026-12-07' } } });
    expect(await ctx.prisma.attendanceRequest.count()).toBe(0);
  });

  it('still lets someone checked in before the holiday check out', async () => {
    const staff = await actor(ctx, 'STAFF');
    ctx.clock.set(new Date('2026-12-06T10:00:00Z')); // Sunday 17:00 Bangkok, not a holiday
    await checkIn(ctx, staff);
    ctx.clock.set(new Date('2026-12-07T02:00:00Z'));
    await addHoliday(today());

    const { requestId, res } = await createRequest(ctx, staff, 'CHECK_OUT');
    expect(res.status).toBe(201);
    const out = await staff.post(`/attendance/requests/${requestId}/confirm`, confirmBody(ctx, OUTSIDE), requestId);
    expect(out.body.status).toBe('APPROVED');
  });

  it('cancels a check-in request that is still pending when the holiday begins', async () => {
    const staff = await actor(ctx, 'STAFF');
    ctx.clock.set(new Date('2026-12-06T16:58:00Z')); // 23:58 Bangkok, the evening before
    const { requestId, res } = await createRequest(ctx, staff, 'CHECK_IN');
    expect(res.status).toBe(201);
    await addHoliday('2026-12-07');
    ctx.clock.set(new Date('2026-12-06T17:01:00Z')); // 00:01 Bangkok on the holiday
    const confirm = await staff.post(`/attendance/requests/${requestId}/confirm`, confirmBody(ctx, INSIDE), requestId);
    expect(confirm.status).toBe(200);
    expect(confirm.body).toMatchObject({ status: 'CANCELLED' });
    expect(await ctx.prisma.attendanceSession.count()).toBe(0);
    expect((await ctx.prisma.attendanceRequest.findUniqueOrThrow({ where: { id: requestId } })).resolutionReason).toBe('HOLIDAY');
  });

  it('administrators manage holidays (create, edit, delete) with audit; staff cannot', async () => {
    const staff = await actor(ctx, 'STAFF');
    expect((await staff.post('/admin/holidays', { date: '2026-12-24', nameEn: 'x', nameTh: 'x', type: 'UNIVERSITY' })).status).toBe(403);

    const admin = await actor(ctx, 'ATTENDANCE_ADMIN');
    const created = await admin.post('/admin/holidays', {
      date: '2026-12-24',
      nameEn: 'Institute closure',
      nameTh: 'วันหยุดของสถาบัน',
      type: 'UNIVERSITY',
      note: 'Year-end closure',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ date: '2026-12-24', type: 'UNIVERSITY', note: 'Year-end closure' });

    const dup = await admin.post('/admin/holidays', { date: '2026-12-24', nameEn: 'Again', nameTh: 'ซ้ำ', type: 'SPECIAL' });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('HOLIDAY_EXISTS');

    const moved = await admin.patch(`/admin/holidays/${created.body.id}`, { date: '2026-12-25', nameEn: 'Institute closure day' });
    expect(moved.body).toMatchObject({ date: '2026-12-25', nameEn: 'Institute closure day', nameTh: 'วันหยุดของสถาบัน' });

    const year = await admin.get('/admin/holidays?year=2026');
    expect(year.body.map((h: { date: string }) => h.date)).toEqual(['2026-12-25']);

    const sa = await actor(ctx, 'SYSTEM_ADMIN');
    expect((await ctx.http.delete(`/api/v1/admin/holidays/${created.body.id}`).set('Authorization', `Bearer ${sa.tokens.accessToken}`)).status).toBe(200);
    expect(await ctx.prisma.holiday.count()).toBe(0);

    const actions = (await ctx.prisma.auditLog.findMany({ where: { entityType: 'Holiday' }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual(['HOLIDAY_CREATED', 'HOLIDAY_UPDATED', 'HOLIDAY_DELETED']);
  });

  it('the migration loads the Thai public holidays', async () => {
    // resetDb empties the table for test isolation, so check the migration file instead of the data.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const sql = fs.readFileSync(path.join(__dirname, '../prisma/migrations/20261122000000_holidays/migration.sql'), 'utf8');
    for (const date of ['2026-04-13', '2026-05-31', '2026-06-01', '2026-12-05', '2026-12-07', '2027-01-01']) {
      expect(sql).toContain(`DATE '${date}'`);
    }
    expect(sql).toContain('ON CONFLICT ("date") DO NOTHING');
  });
});
