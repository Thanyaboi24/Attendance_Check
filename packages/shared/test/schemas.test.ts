import { describe, expect, it } from 'vitest';
import {
  CreateAttendanceRequestSchema,
  CreateCorrectionSchema,
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
    const base = {
      name: 'SIIT',
      centerLat: 14,
      centerLng: 100,
      gracePeriodSec: 300,
      maxLocationAgeSec: 60,
      maxAccuracyM: 30,
      reason: 'field test',
    };
    expect(UpdateGeofenceConfigSchema.safeParse({ ...base, radiusM: 1001 }).success).toBe(false);
    expect(UpdateGeofenceConfigSchema.safeParse({ ...base, radiusM: 150 }).success).toBe(true);
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
