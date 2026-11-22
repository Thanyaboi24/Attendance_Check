import { resetEnvCache } from '../src/config/env';
import { actor, createTestApp, createUser, PASSWORD, resetDb, type TestContext } from './helpers';

const applicant = {
  staffId: 'S90001',
  email: 'New.Staff@siit.tu.ac.th',
  fullName: 'New Staff',
  department: 'School of ICT',
  password: 'Welcome123',
};

describe('Staff sign-up and approval (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.close());
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    ctx.clock.set(new Date());
  });

  const signUp = (body: object = applicant) => ctx.http.post('/api/v1/auth/signup').send(body);
  const loginAs = (email = applicant.email, password = applicant.password) =>
    ctx.http.post('/api/v1/auth/login').send({ email, password });

  it('creates a STAFF account waiting for approval that cannot sign in yet', async () => {
    const r = await signUp();
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ status: 'PENDING_APPROVAL', email: 'new.staff@siit.tu.ac.th' });

    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'new.staff@siit.tu.ac.th' } });
    expect(user).toMatchObject({ role: 'STAFF', status: 'PENDING_APPROVAL', selfRegistered: true });
    expect(user.passwordHash).not.toBe(applicant.password);

    const login = await loginAs();
    expect(login.status).toBe(403);
    expect(login.body.code).toBe('ACCOUNT_PENDING_APPROVAL');

    // A wrong password still gets the generic message (the pending state is not revealed).
    const wrong = await loginAs(applicant.email, 'nope12345');
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');

    const audit = await ctx.prisma.auditLog.findMany({ where: { entityId: user.id } });
    expect(audit.map((a) => a.action)).toEqual(['USER_SIGNED_UP']);
  });

  it('validates the input and refuses a duplicate email or staff ID', async () => {
    const weak = await signUp({ ...applicant, password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe('VALIDATION_FAILED');

    const existing = await createUser(ctx.prisma);
    expect((await signUp({ ...applicant, email: existing.email })).body.code).toBe('DUPLICATE_USER');
    expect((await signUp({ ...applicant, staffId: existing.staffId })).body.code).toBe('DUPLICATE_USER');
    expect((await signUp({ ...applicant, staffId: existing.staffId })).status).toBe(409);
  });

  it('an Attendance Administrator approves; the staff member can then sign in and is emailed', async () => {
    await signUp();
    const admin = await actor(ctx, 'ATTENDANCE_ADMIN');

    const pending = await admin.get('/admin/signups');
    expect(pending.status).toBe(200);
    expect(pending.body.total).toBe(1);
    const item = pending.body.items[0];
    expect(item).toMatchObject({ email: 'new.staff@siit.tu.ac.th', status: 'PENDING_APPROVAL', reviewedBy: null });

    const summary = await admin.get('/admin/dashboard/summary');
    expect(summary.body.pendingSignups).toBe(1);

    const approved = await admin.post(`/admin/signups/${item.id}/approve`, { note: 'Welcome' });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({
      status: 'ACTIVE',
      reviewNote: 'Welcome',
      reviewedBy: { id: admin.user.id, fullName: admin.user.fullName },
    });
    expect(ctx.mail.outbox.at(-1)).toMatchObject({ to: 'new.staff@siit.tu.ac.th', subject: expect.stringContaining('approved') });

    const login = await loginAs();
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ role: 'STAFF', status: 'ACTIVE' });

    // Already decided: a second decision is refused.
    const again = await admin.post(`/admin/signups/${item.id}/reject`, { reason: 'late' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('SIGNUP_NOT_PENDING');
    expect((await admin.get('/admin/signups?status=ACTIVE')).body.total).toBe(1);
    expect((await admin.get('/admin/dashboard/summary')).body.pendingSignups).toBe(0);
  });

  it('a rejection needs a reason, blocks sign-in with the reason, and allows applying again', async () => {
    await signUp();
    const admin = await actor(ctx, 'SYSTEM_ADMIN');
    const id = (await admin.get('/admin/signups')).body.items[0].id as string;

    expect((await admin.post(`/admin/signups/${id}/reject`, { reason: ' ' })).status).toBe(400);
    const rejected = await admin.post(`/admin/signups/${id}/reject`, { reason: 'Staff ID not found in HR records' });
    expect(rejected.body).toMatchObject({ status: 'REJECTED', reviewNote: 'Staff ID not found in HR records' });
    expect(ctx.mail.outbox.at(-1)?.text).toContain('Staff ID not found in HR records');

    const login = await loginAs();
    expect(login.status).toBe(403);
    expect(login.body).toMatchObject({ code: 'ACCOUNT_REJECTED', details: { reason: 'Staff ID not found in HR records' } });

    // Apply again with corrected details: back to pending, previous decision cleared.
    const again = await signUp({ ...applicant, staffId: 'S90002', password: 'Another123' });
    expect(again.status).toBe(201);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id } });
    expect(user).toMatchObject({ status: 'PENDING_APPROVAL', staffId: 'S90002', reviewNote: null, reviewedById: null });
    expect((await loginAs(applicant.email, 'Another123')).body.code).toBe('ACCOUNT_PENDING_APPROVAL');
  });

  it('only administrators can review sign-ups, and user management cannot bypass the review', async () => {
    await signUp();
    const staff = await actor(ctx, 'STAFF');
    expect((await staff.get('/admin/signups')).status).toBe(403);

    const sa = await actor(ctx, 'SYSTEM_ADMIN');
    const id = (await sa.get('/admin/signups')).body.items[0].id as string;
    const bypass = await sa.patch(`/admin/users/${id}`, { status: 'ACTIVE' });
    expect(bypass.status).toBe(409);
    expect(bypass.body.code).toBe('SIGNUP_NOT_PENDING');
    expect((await ctx.http.post(`/api/v1/admin/signups/${id}/approve`).send({})).status).toBe(401);
  });

  it('restricts sign-up to the configured email domains and can be switched off', async () => {
    const prev = { domains: process.env.SIGNUP_EMAIL_DOMAINS, enabled: process.env.SIGNUP_ENABLED };
    const restart = async () => {
      await ctx.close();
      resetEnvCache();
      ctx = await createTestApp();
      await resetDb(ctx.prisma);
    };
    try {
      // Non-institutional domains are refused by the shared schema, whatever the env says.
      const gmail = await signUp({ ...applicant, email: 'someone@gmail.com' });
      expect(gmail.status).toBe(400);
      expect(JSON.stringify(gmail.body)).toContain('@g.siit.tu.ac.th');

      // SIGNUP_EMAIL_DOMAINS can narrow sign-up to some of the institutional domains.
      process.env.SIGNUP_EMAIL_DOMAINS = 'siit.tu.ac.th';
      await restart();
      const gsiit = await signUp({ ...applicant, email: 'someone@g.siit.tu.ac.th' });
      expect(gsiit.status).toBe(400);
      expect(gsiit.body.message).toContain('@siit.tu.ac.th');
      expect((await signUp()).status).toBe(201);

      process.env.SIGNUP_ENABLED = 'false';
      await restart();
      const off = await signUp();
      expect(off.status).toBe(403);
      expect(off.body.code).toBe('SIGNUP_DISABLED');
    } finally {
      if (prev.domains === undefined) delete process.env.SIGNUP_EMAIL_DOMAINS;
      else process.env.SIGNUP_EMAIL_DOMAINS = prev.domains;
      if (prev.enabled === undefined) delete process.env.SIGNUP_ENABLED;
      else process.env.SIGNUP_ENABLED = prev.enabled;
      await restart();
    }
    // Sanity: existing accounts are unaffected.
    const u = await createUser(ctx.prisma);
    expect((await loginAs(u.email, PASSWORD)).status).toBe(200);
  });
});
