import type { GeofenceConfig, LocationReading, TokenPair, UserProfile } from '@attendance/shared';
import { LocationUnavailableError } from '../../src/domain/errors';
import type { AppDeps, AuthApi, PermissionSnapshot, PresentResult, SessionStore } from '../../src/domain/ports';
import { FakeBackend } from './fakeBackend';
import { MemoryStore } from './memoryStore';

/** SIIT Rangsit seed config (docs/API.md). */
export const CONFIG_V1: GeofenceConfig = {
  version: 1,
  name: 'SIIT Rangsit',
  centerLat: 14.0693,
  centerLng: 100.6035,
  radiusM: 150,
  gracePeriodSec: 300,
  maxLocationAgeSec: 60,
  maxAccuracyM: 30,
  effectiveAt: '2026-01-01T00:00:00.000Z',
};

export const T0 = new Date('2026-11-03T01:00:00.000Z'); // 08:00 Bangkok

export const STAFF: UserProfile = {
  id: 'user-1',
  staffId: 'S001',
  email: 'staff@siit.tu.ac.th',
  fullName: 'Staff Member',
  department: 'ICT',
  role: 'STAFF',
  status: 'ACTIVE',
};

export const TOKENS: TokenPair = { accessToken: 'access-1', refreshToken: 'refresh-1', accessTokenExpiresAt: '2026-11-03T01:15:00.000Z' };

/** Metres → degrees of latitude (north of the centre). */
const M_PER_DEG_LAT = (6_371_000 * Math.PI) / 180;

export class FakeClock {
  t: number;
  constructor(start: Date) {
    this.t = start.getTime();
  }
  now = () => new Date(this.t);
  advance(ms: number) {
    this.t += ms;
  }
}

export type FixSpec = { distanceM: number; accuracyM?: number | null; ageSec?: number; isMock?: boolean } | Error;

/** Returns fixes from a script; each fix is measured "now" (minus ageSec) at `distanceM` north of the centre. */
export class FakeLocation {
  script: FixSpec[] = [];
  fallback: FixSpec | null = null;
  calls = 0;
  constructor(
    private readonly clock: FakeClock,
    private readonly cfg: GeofenceConfig,
  ) {}
  next(...specs: FixSpec[]) {
    this.script.push(...specs);
    return this;
  }
  always(spec: FixSpec) {
    this.fallback = spec;
    return this;
  }
  getFreshLocation = async (): Promise<LocationReading> => {
    this.calls++;
    const spec = this.script.shift() ?? this.fallback;
    if (!spec) throw new LocationUnavailableError('TIMEOUT', 'no scripted fix');
    if (spec instanceof Error) throw spec;
    return {
      lat: this.cfg.centerLat + spec.distanceM / M_PER_DEG_LAT,
      lng: this.cfg.centerLng,
      accuracyM: spec.accuracyM === undefined ? 10 : spec.accuracyM,
      measuredAt: new Date(this.clock.t - (spec.ageSec ?? 0) * 1000).toISOString(),
      isMock: spec.isMock ?? false,
    };
  };
}

export const INSIDE = { distanceM: 50, accuracyM: 10 };
export const OUTSIDE = { distanceM: 400, accuracyM: 10 };
export const BOUNDARY = { distanceM: 145, accuracyM: 20 };

export class FakeNotifier {
  fail = false;
  presented: Array<{ requestId: string; type: string }> = [];
  dismissed: string[] = [];
  info: Array<{ title: string; body: string }> = [];
  dismissedAll = 0;
  constructor(private readonly clock: FakeClock) {}
  presentAttendanceRequest = async (input: { requestId: string; type: string }): Promise<PresentResult> => {
    if (this.fail) return { status: 'FAILED', error: 'notifications disabled' };
    this.presented.push(input);
    return { status: 'POSTED', postedAt: this.clock.now().toISOString() };
  };
  dismissAttendanceRequest = async (id: string) => {
    this.dismissed.push(id);
  };
  dismissAll = async () => {
    this.dismissedAll++;
  };
  showInfo = async (i: { title: string; body: string }) => {
    this.info.push(i);
  };
}

export class FakeScheduler {
  jobs = new Map<string, number>();
  log: string[] = [];
  syncScheduled = 0;
  schedule = async (id: string, delayMs: number) => {
    this.log.push(`schedule:${id}:${delayMs}`);
    if (!this.jobs.has(id)) this.jobs.set(id, delayMs); // ExistingWorkPolicy.KEEP
  };
  cancel = async (id: string) => {
    this.log.push(`cancel:${id}`);
    this.jobs.delete(id);
  };
  cancelAll = async () => {
    this.log.push('cancelAll');
    this.jobs.clear();
  };
  scheduleSync = async () => {
    this.syncScheduled++;
  };
  /** Simulate WorkManager firing the job (it is then no longer pending). */
  fire(id: string) {
    this.jobs.delete(id);
  }
}

export class FakeGeofence {
  running: GeofenceConfig | null = null;
  starts = 0;
  start = async (cfg: GeofenceConfig) => {
    this.running = cfg;
    this.starts++;
  };
  stop = async () => {
    this.running = null;
  };
  isRunning = async () => this.running != null;
}

export class FakeSession implements SessionStore {
  tokens: TokenPair | null = TOKENS;
  user: UserProfile | null = STAFF;
  async getTokens() {
    return this.tokens;
  }
  async setTokens(t: TokenPair) {
    this.tokens = t;
  }
  async getUser() {
    return this.user;
  }
  async setUser(u: UserProfile) {
    this.user = u;
  }
  async clear() {
    this.tokens = null;
    this.user = null;
  }
}

export const ALL_PERMISSIONS: PermissionSnapshot = {
  notifications: true,
  foregroundLocation: true,
  preciseLocation: true,
  backgroundLocation: true,
  locationServices: true,
};

export function makeDeps(opts: { cfg?: GeofenceConfig; now?: Date } = {}) {
  const cfg = opts.cfg ?? CONFIG_V1;
  const clock = new FakeClock(opts.now ?? T0);
  const backend = new FakeBackend(cfg, clock.now);
  const store = new MemoryStore();
  const location = new FakeLocation(clock, cfg);
  const notifier = new FakeNotifier(clock);
  const scheduler = new FakeScheduler();
  const geofence = new FakeGeofence();
  const session = new FakeSession();
  let permissions: PermissionSnapshot = { ...ALL_PERMISSIONS };
  let uuidSeq = 0;
  const sleeps: number[] = [];

  const authApi: AuthApi & { loggedOut: string[]; loginUser: UserProfile } = {
    loggedOut: [],
    loginUser: STAFF,
    async login() {
      return { tokens: TOKENS, user: this.loginUser };
    },
    async logout(rt: string) {
      this.loggedOut.push(rt);
    },
    async me() {
      return this.loginUser;
    },
    async forgotPassword() {},
    async activate() {},
    async resetPassword() {},
  };

  const deps: AppDeps = {
    api: backend,
    authApi,
    store,
    session,
    location,
    notifier,
    scheduler,
    geofence,
    permissions: { check: async () => permissions },
    clock,
    uuid: () => `00000000-0000-4000-8000-${String(++uuidSeq).padStart(12, '0')}`,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      clock.advance(ms);
    },
    device: () => ({ model: 'Pixel 8', os: 'Android 16', appVersion: '1.0.0' }),
  };

  return {
    deps,
    cfg,
    clock,
    backend,
    store,
    location,
    notifier,
    scheduler,
    geofence,
    session,
    authApi,
    sleeps,
    setPermissions(p: Partial<PermissionSnapshot>) {
      permissions = { ...permissions, ...p };
    },
    /** Seed the local cache as after a successful login + state refresh. */
    async seed(state: { openSession?: boolean } = {}) {
      await store.saveConfig(cfg);
      await store.setMeta('activeConfigVersion', String(cfg.version));
      if (state.openSession) {
        const s = {
          id: 'session-0',
          checkInAt: new Date(clock.t - 3600_000).toISOString(),
          checkInMethod: 'MANUAL' as const,
          checkOutAt: null,
          checkOutMethod: null,
          status: 'OPEN' as const,
          corrected: false,
        };
        backend.openSession = s;
        backend.sessions.push(s);
      }
      await store.saveSnapshot({
        openSession: backend.openSession,
        todaySessions: backend.sessions,
        activeConfigVersion: cfg.version,
        serverTime: clock.now().toISOString(),
        fetchedAt: clock.now().toISOString(),
      });
    },
  };
}

export type Harness = ReturnType<typeof makeDeps>;
