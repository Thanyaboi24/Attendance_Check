import { describe, expect, it } from 'vitest';
import {
  CreateAttendanceRequestSchema,
  CreateCorrectionSchema,
  CreateUserSchema,
  ForgotPasswordRequestSchema,
  INSTITUTIONAL_EMAIL_MESSAGE,
  isInstitutionalEmail,
  SignUpRequestSchema,
  LoginRequestSchema,
  PasswordSchema,
  UpdateGeofenceConfigSchema,
} from '../src';
import { addDays, bangkokDayBounds, bangkokLocalToIso, formatBangkokTime, toBangkokDate } from '../src/time';

describe('schemas', () => {
  it('normalises the login email', () => {
    expect(LoginRequestSchema.parse({ email: '  Staff@SIIT.tu.ac.th ', password: 'x' }).email).toBe(
      'staff@siit.tu.ac.th',
    );
  });

  it('requires notificationPostedAt when the notification was posted', () => {
    const base = {
      requestId: '6f1c2a7e-0b7d-4a35-9c2e-1d8f0e5b3a11',
      type: 'CHECK_IN',
      configVersion: 3,
      geofenceDetectedAt: '2026-11-01T01:28:04Z',
    };
    expect(
      CreateAttendanceRequestSchema.safeParse({ ...base, notificationStatus: 'POSTED', notificationPostedAt: null })
        .success,
    ).toBe(false);
    expect(
      CreateAttendanceRequestSchema.safeParse({ ...base, notificationStatus: 'FAILED', notificationPostedAt: null })
        .success,
    ).toBe(true);
  });

  it('rejects a correction whose check-out precedes check-in', () => {
    const r = CreateCorrectionSchema.safeParse({
      correctionId: '6f1c2a7e-0b7d-4a35-9c2e-1d8f0e5b3a11',
      sessionId: null,
      workDate: '2026-11-01',
      requestedCheckInAt: '2026-11-01T09:00:00Z',
      requestedCheckOutAt: '2026-11-01T08:00:00Z',
      reason: 'Forgot to check out',
    });
    expect(r.success).toBe(false);
  });

  it('limits the geofence radius to 1..1000 m', () => {
    const base = { name: 'SIIT', gracePeriodSec: 300, maxLocationAgeSec: 60, maxAccuracyM: 30, reason: 'field test' };
    const zone = (radiusM: number, name = 'Rangsit') => ({ name, centerLat: 14, centerLng: 100, radiusM });
    expect(UpdateGeofenceConfigSchema.safeParse({ ...base, zones: [zone(1001)] }).success).toBe(false);
    expect(UpdateGeofenceConfigSchema.safeParse({ ...base, zones: [zone(150)] }).success).toBe(true);
  });

  it('accepts several named areas but not zero or duplicate names', () => {
    const base = { name: 'SIIT', gracePeriodSec: 300, maxLocationAgeSec: 60, maxAccuracyM: 30, reason: 'add campus' };
    const zone = (name: string) => ({ name, centerLat: 14, centerLng: 100, radiusM: 150 });
    expect(UpdateGeofenceConfigSchema.safeParse({ ...base, zones: [zone('Rangsit'), zone('Bangkadi')] }).success).toBe(true);
    expect(UpdateGeofenceConfigSchema.safeParse({ ...base, zones: [] }).success).toBe(false);
    expect(UpdateGeofenceConfigSchema.safeParse({ ...base, zones: [zone('Rangsit'), zone('rangsit ')] }).success).toBe(false);
  });

  it('enforces the password policy', () => {
    expect(PasswordSchema.safeParse('short1').success).toBe(false);
    expect(PasswordSchema.safeParse('longpassword').success).toBe(false);
    expect(PasswordSchema.safeParse('longpassw0rd').success).toBe(true);
  });
});

describe('Asia/Bangkok time helpers', () => {
  it('maps instants to the Bangkok calendar day', () => {
    expect(toBangkokDate('2026-10-31T17:00:00Z')).toBe('2026-11-01');
    expect(toBangkokDate('2026-10-31T16:59:59Z')).toBe('2026-10-31');
  });
  it('computes day bounds in UTC', () => {
    const { start, end } = bangkokDayBounds('2026-11-01');
    expect(start.toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-01T17:00:00.000Z');
  });
  it('formats and parses local times', () => {
    expect(formatBangkokTime('2026-11-01T01:33:13Z')).toBe('08:33');
    expect(bangkokLocalToIso('2026-11-01', '08:30')).toBe('2026-11-01T01:30:00.000Z');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('institutional email', () => {
  it('accepts only @siit.tu.ac.th and @g.siit.tu.ac.th', () => {
    expect(isInstitutionalEmail('somchai@siit.tu.ac.th')).toBe(true);
    expect(isInstitutionalEmail(' 6522771234@G.SIIT.tu.ac.th ')).toBe(true);
    expect(isInstitutionalEmail('someone@gmail.com')).toBe(false);
    expect(isInstitutionalEmail('someone@tu.ac.th')).toBe(false);
    expect(isInstitutionalEmail('someone@x.siit.tu.ac.th')).toBe(false);
    expect(isInstitutionalEmail('someone@siit.tu.ac.th.evil.com')).toBe(false);
    expect(isInstitutionalEmail('siit.tu.ac.th')).toBe(false);
  });

  it('is enforced by the login, forgot-password, sign-up and create-user schemas', () => {
    const signUp = { staffId: 'S1', fullName: 'A B', department: 'ICT', password: 'Passw0rd!' };
    const user = { staffId: 'S1', fullName: 'A B', department: 'ICT', role: 'STAFF' };
    for (const [email, ok] of [
      ['a@siit.tu.ac.th', true],
      ['a@g.siit.tu.ac.th', true],
      ['a@gmail.com', false],
    ] as const) {
      expect(LoginRequestSchema.safeParse({ email, password: 'x' }).success).toBe(ok);
      expect(ForgotPasswordRequestSchema.safeParse({ email }).success).toBe(ok);
      expect(SignUpRequestSchema.safeParse({ ...signUp, email }).success).toBe(ok);
      expect(CreateUserSchema.safeParse({ ...user, email }).success).toBe(ok);
    }
    const bad = LoginRequestSchema.safeParse({ email: 'a@gmail.com', password: 'x' });
    expect(bad.success ? undefined : bad.error.issues[0]?.message).toBe(INSTITUTIONAL_EMAIL_MESSAGE);
  });
});
