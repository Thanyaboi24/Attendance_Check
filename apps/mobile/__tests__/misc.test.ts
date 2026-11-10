import { displayStatusOf } from '../src/domain/displayStatus';
import type { LocalRequest } from '../src/domain/models';
import { MIGRATIONS, migrate } from '../src/data/db/migrations';
import { csvEscape, eventsCsv, requestsCsv } from '../src/features/settings/evaluationExport';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../modules/attendance-scheduler/app.plugin.js') as {
  addSchedulerToManifest: (m: unknown) => {
    manifest: {
      'uses-permission': Array<{ $: Record<string, string> }>;
      application: Array<{ service: Array<{ $: Record<string, string> }>; receiver: Array<{ $: Record<string, string> }> }>;
    };
  };
};

const base: Pick<LocalRequest, 'status' | 'syncStatus' | 'localAction' | 'resolutionReason'> = {
  status: 'ACTIVE',
  syncStatus: 'SYNCED',
  localAction: null,
  resolutionReason: null,
};

describe('display status (DS2 §2.10.4: Recorded · Pending · Uncertain location · Failed · Unsynchronized)', () => {
  it('never shows an unsynchronised decision as recorded', () => {
    expect(displayStatusOf({ ...base, localAction: 'CONFIRM', syncStatus: 'PENDING_SYNC' })).toBe('UNSYNCHRONIZED');
    expect(displayStatusOf({ ...base, status: 'APPROVED', syncStatus: 'PENDING_SYNC' })).toBe('UNSYNCHRONIZED');
    expect(displayStatusOf({ ...base, status: 'APPROVED' })).toBe('RECORDED');
  });
  it('separates pending, uncertain, failed and cancelled', () => {
    expect(displayStatusOf(base)).toBe('PENDING');
    expect(displayStatusOf({ ...base, status: 'UNRESOLVED', resolutionReason: 'UNCERTAIN_LOCATION' })).toBe('UNCERTAIN_LOCATION');
    expect(displayStatusOf({ ...base, status: 'UNRESOLVED', resolutionReason: 'NOTIFICATION_FAILED' })).toBe('FAILED');
    expect(displayStatusOf({ ...base, status: 'REJECTED' })).toBe('FAILED');
    expect(displayStatusOf({ ...base, syncStatus: 'FAILED' })).toBe('FAILED');
    expect(displayStatusOf({ ...base, status: 'CANCELLED' })).toBe('CANCELLED');
  });
});

describe('SQLite migration runner', () => {
  it('applies pending migrations once and records PRAGMA user_version', async () => {
    let version = 0;
    const executed: string[] = [];
    const db = {
      execAsync: async (sql: string) => {
        executed.push(sql);
        const m = /PRAGMA user_version = (\d+)/.exec(sql);
        if (m) version = Number(m[1]);
      },
      getFirstAsync: async <T,>() => ({ user_version: version }) as T,
      withTransactionAsync: async (fn: () => Promise<void>) => fn(),
    };
    expect(await migrate(db)).toBe(MIGRATIONS.length);
    const count = executed.length;
    expect(await migrate(db)).toBe(MIGRATIONS.length);
    expect(executed).toHaveLength(count);
    expect(executed.join('\n')).toMatch(/CREATE TABLE IF NOT EXISTS outbox_entry/);
    expect(executed.join('\n')).toMatch(/CREATE TABLE IF NOT EXISTS event_log/);
  });
});

describe('evaluation export', () => {
  it('escapes CSV values', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape(null)).toBe('');
    expect(csvEscape({ a: 1 })).toBe('"{""a"":1}"');
  });
  it('writes one row per request with the §8.3 timestamps', () => {
    const r: LocalRequest = {
      requestId: 'r1',
      type: 'CHECK_IN',
      status: 'APPROVED',
      sessionId: 's1',
      configVersion: 3,
      geofenceDetectedAt: '2026-11-01T01:28:04Z',
      notificationStatus: 'POSTED',
      notificationPostedAt: '2026-11-01T01:28:05Z',
      deadlineAt: '2026-11-01T01:33:05Z',
      method: 'AUTOMATIC',
      syncStatus: 'SYNCED',
      localAction: null,
      lastClassification: 'CONFIRMED_INSIDE',
      lastDistanceM: 84.3,
      resolutionReason: null,
      officialTime: '2026-11-01T01:33:13Z',
      userConfirmedAt: null,
      lastError: null,
      createdAt: '2026-11-01T01:28:04Z',
      updatedAt: '2026-11-01T01:33:13Z',
    };
    const csv = requestsCsv(
      [r],
      new Map([
        [
          'r1',
          [
            {
              evidenceId: 'e1',
              requestId: 'r1',
              purpose: 'AUTO' as const,
              lat: 14,
              lng: 100,
              measuredAt: '2026-11-01T01:33:12Z',
              accuracyM: 12,
              distanceM: 84.33,
              classification: 'CONFIRMED_INSIDE' as const,
              uncertainReason: null,
              isMock: false,
              createdAt: '2026-11-01T01:33:12Z',
            },
          ],
        ],
      ]),
      { model: 'Pixel 8', os: 'Android 16', appVersion: '1.0.0' },
    );
    const [header, row] = csv.split('\n');
    expect(header).toContain('geofenceDetectedAt,notificationStatus,notificationPostedAt,userConfirmedAt,locationMeasuredAt');
    expect(row).toBe(
      'r1,CHECK_IN,APPROVED,AUTOMATIC,3,2026-11-01T01:28:04Z,POSTED,2026-11-01T01:28:05Z,,2026-11-01T01:33:12Z,12,84.3,CONFIRMED_INSIDE,,false,1,2026-11-01T01:33:13Z,,SYNCED,Pixel 8,Android 16,1.0.0',
    );
    expect(eventsCsv([{ id: 1, at: 't', type: 'LOGIN', requestId: null, detail: { ok: true } }])).toBe(
      'id,at,type,requestId,detail\n1,t,LOGIN,,"{""ok"":true}"',
    );
  });
});

describe('attendance-scheduler config plugin', () => {
  it('adds permissions, the location foreground service and the boot receiver (idempotent)', () => {
    const manifest = { manifest: { $: {}, 'uses-permission': [{ $: { 'android:name': 'android.permission.INTERNET' } }], application: [{ $: {} }] } };
    plugin.addSchedulerToManifest(manifest);
    const out = plugin.addSchedulerToManifest(manifest);
    const perms = out.manifest['uses-permission'].map((p) => p.$['android:name']);
    expect(perms).toEqual(
      expect.arrayContaining([
        'android.permission.FOREGROUND_SERVICE_LOCATION',
        'android.permission.RECEIVE_BOOT_COMPLETED',
        'android.permission.FOREGROUND_SERVICE',
      ]),
    );
    expect(new Set(perms).size).toBe(perms.length);
    const app = out.manifest.application[0]!;
    expect(app.service).toHaveLength(1);
    expect(app.service[0]!.$).toMatchObject({
      'android:name': 'th.ac.siit.attendance.scheduler.GracePeriodHeadlessService',
      'android:foregroundServiceType': 'location',
    });
    expect(app.receiver).toHaveLength(1);
  });
});
