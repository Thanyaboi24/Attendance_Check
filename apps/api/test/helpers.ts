import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { EARTH_RADIUS_M, type EvidenceInput } from '@attendance/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { ClockService } from '../src/common/clock.service';
import { loadEnv, resetEnvCache } from '../src/config/env';
import { MailService } from '../src/mail/mail.service';

/** Controllable server clock (grace periods, lockouts, retention). */
export class FakeClock extends ClockService {
  private t = Date.now();
  now() {
    return new Date(this.t);
  }
  set(d: Date | string) {
    this.t = typeof d === 'string' ? Date.parse(d) : d.getTime();
  }
  advance(ms: number) {
    this.t += ms;
  }
}

export const CENTER = { lat: 14.0693, lng: 100.6035 };
export const PASSWORD = 'Passw0rd1';

export interface TestContext {
  app: INestApplication;
  http: ReturnType<typeof request>;
  prisma: PrismaClient;
  clock: FakeClock;
  mail: MailService;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestContext> {
  resetEnvCache();
  const clock = new FakeClock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ClockService)
    .useValue(clock)
    .compile();
  const app = moduleRef.createNestApplication({ bodyParser: false, logger: ['error'] });
  configureApp(app, loadEnv());
  await app.init();
  const prisma = new PrismaClient();
  return {
    app,
    http: request(app.getHttpServer()),
    prisma,
    clock,
    mail: app.get(MailService),
    close: async () => {
      await prisma.$disconnect();
      await app.close();
    },
  };
}

/** Empty every table and create geofence v1 (150 m, 300 s grace, 60 s age, 30 m accuracy). */
export async function resetDb(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "AuditLog","NotificationEvent","LocationEvidence","CorrectionRequest","AttendanceRequest","AttendanceSession","GeofenceConfiguration","ActionToken","RefreshToken","User" RESTART IDENTITY CASCADE',
  );
  await prisma.geofenceConfiguration.create({
    data: {
      name: 'SIIT test',
      centerLat: CENTER.lat,
      centerLng: CENTER.lng,
      radiusM: 150,
      gracePeriodSec: 300,
      maxLocationAgeSec: 60,
      maxAccuracyM: 30,
    },
  });
}

let hashCache: string | undefined;
let counter = 0;

export async function createUser(
  prisma: PrismaClient,
  overrides: Partial<{ role: 'STAFF' | 'ATTENDANCE_ADMIN' | 'SYSTEM_ADMIN'; status: 'ACTIVE' | 'PENDING_ACTIVATION' | 'DEACTIVATED'; email: string }> = {},
) {
  hashCache ??= await argon2.hash(PASSWORD, { type: argon2.argon2id });
  counter += 1;
  return prisma.user.create({
    data: {
      staffId: `T${String(counter).padStart(5, '0')}`,
      email: overrides.email ?? `user${counter}@siit.tu.ac.th`,
      fullName: `Test User ${counter}`,
      department: 'School of ICT',
      role: overrides.role ?? 'STAFF',
      status: overrides.status ?? 'ACTIVE',
      passwordHash: hashCache,
    },
  });
}

export async function login(ctx: TestContext, email: string, password = PASSWORD) {
  const res = await ctx.http.post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { tokens: { accessToken: string; refreshToken: string }; user: { id: string } };
}

/** Logged-in staff (or other role) with a bearer-token request helper. */
export async function actor(ctx: TestContext, role: 'STAFF' | 'ATTENDANCE_ADMIN' | 'SYSTEM_ADMIN' = 'STAFF') {
  const user = await createUser(ctx.prisma, { role });
  const session = await login(ctx, user.email);
  const auth = { Authorization: `Bearer ${session.tokens.accessToken}` };
  return {
    user,
    tokens: session.tokens,
    get: (url: string) => ctx.http.get(`/api/v1${url}`).set(auth),
    post: (url: string, body?: object, key?: string) => {
      const r = ctx.http.post(`/api/v1${url}`).set(auth);
      if (key) r.set('Idempotency-Key', key);
      return r.send(body ?? {});
    },
    patch: (url: string, body: object) => ctx.http.patch(`/api/v1${url}`).set(auth).send(body),
    put: (url: string, body: object) => ctx.http.put(`/api/v1${url}`).set(auth).send(body),
  };
}
export type Actor = Awaited<ReturnType<typeof actor>>;

/** Evidence `north` metres north of the centre, measured `ageSec` before the server clock. */
export function evidence(ctx: TestContext, north: number, accuracyM: number | null = 10, ageSec = 5, isMock = false): EvidenceInput {
  const metresPerDeg = (EARTH_RADIUS_M * Math.PI) / 180;
  return {
    lat: CENTER.lat + north / metresPerDeg,
    lng: CENTER.lng,
    accuracyM,
    measuredAt: new Date(ctx.clock.now().getTime() - ageSec * 1000).toISOString(),
    isMock,
  };
}

export const INSIDE = 50;
export const OUTSIDE = 400;
export const BOUNDARY = 145;

/** POST /attendance/requests as the phone would, after posting the notification. */
export async function createRequest(
  ctx: TestContext,
  staff: Actor,
  type: 'CHECK_IN' | 'CHECK_OUT',
  opts: { notificationStatus?: 'POSTED' | 'FAILED'; configVersion?: number; requestId?: string } = {},
) {
  const requestId = opts.requestId ?? randomUUID();
  const now = ctx.clock.now().toISOString();
  const notificationStatus = opts.notificationStatus ?? 'POSTED';
  const res = await staff.post(
    '/attendance/requests',
    {
      requestId,
      type,
      configVersion: opts.configVersion ?? 1,
      geofenceDetectedAt: now,
      notificationStatus,
      notificationPostedAt: notificationStatus === 'POSTED' ? now : null,
      device: { model: 'Pixel 8', os: 'Android 16', appVersion: '1.0.0' },
    },
    requestId,
  );
  return { requestId, res };
}

export function confirmBody(ctx: TestContext, north: number, accuracyM = 10) {
  const now = ctx.clock.now().toISOString();
  return { userConfirmedAt: now, clientRecordedAt: now, evidence: evidence(ctx, north, accuracyM) };
}

export function autoBody(ctx: TestContext, north: number, accuracyM: number | null = 10, ageSec = 5, isMock = false) {
  const now = ctx.clock.now().toISOString();
  return { notificationPostedAt: now, clientRecordedAt: now, evidence: evidence(ctx, north, accuracyM, ageSec, isMock), locationAttempts: 1 };
}

/** Full manual check-in, returns the session id. */
export async function checkIn(ctx: TestContext, staff: Actor): Promise<string> {
  const { requestId } = await createRequest(ctx, staff, 'CHECK_IN');
  const res = await staff.post(`/attendance/requests/${requestId}/confirm`, confirmBody(ctx, INSIDE), requestId);
  if (res.body.status !== 'APPROVED') throw new Error(`check-in failed: ${JSON.stringify(res.body)}`);
  return res.body.sessionId;
}

export const GRACE_MS = 300_000;
