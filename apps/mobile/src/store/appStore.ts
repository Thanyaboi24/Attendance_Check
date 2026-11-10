import type { AttendanceState, GeofenceConfig, LocationClass, SessionDto, UserProfile } from '@attendance/shared';
import { create } from 'zustand';
import type { LocalRequest } from '../domain/models';
import type { MonitoringStatus } from '../domain/useCases/monitoring';

export type AuthStatus = 'unknown' | 'signedOut' | 'signedIn';

export interface DashboardModel {
  state: AttendanceState;
  openSession: SessionDto | null;
  todaySessions: SessionDto[];
  /** Request waiting for the user / grace period. */
  pending: LocalRequest | null;
  /** Decisions saved on the phone but not yet confirmed by the backend. */
  unsynced: LocalRequest[];
  recent: LocalRequest[];
  outboxCount: number;
  failedOutboxCount: number;
  config: GeofenceConfig | null;
  snapshotFetchedAt: string | null;
}

export interface LastFix {
  lat: number;
  lng: number;
  accuracyM: number | null;
  measuredAt: string;
  classification: LocationClass;
  distanceM: number | null;
  uncertainReason: string | null;
  isMock: boolean;
}

export interface NotificationIntent {
  requestId: string;
  action: 'CHECK_IN' | 'CHECK_OUT' | 'OPEN';
  /** When the user tapped (ISO) — sent as userConfirmedAt. */
  at: string;
}

interface AppStore {
  authStatus: AuthStatus;
  user: UserProfile | null;
  /** Shown on the login screen after a non-STAFF account tried to sign in. */
  notStaffMessage: string | null;
  onboarded: boolean;
  monitoring: MonitoringStatus | null;
  online: boolean;
  dashboard: DashboardModel | null;
  lastFix: LastFix | null;
  notificationIntent: NotificationIntent | null;

  setSignedIn(user: UserProfile): void;
  setSignedOut(message?: string | null): void;
  setOnboarded(v: boolean): void;
  setMonitoring(m: MonitoringStatus | null): void;
  setOnline(v: boolean): void;
  setDashboard(d: DashboardModel | null): void;
  setLastFix(f: LastFix | null): void;
  setNotificationIntent(i: NotificationIntent | null): void;
}

export const useAppStore = create<AppStore>()((set) => ({
  authStatus: 'unknown',
  user: null,
  notStaffMessage: null,
  onboarded: false,
  monitoring: null,
  online: true,
  dashboard: null,
  lastFix: null,
  notificationIntent: null,

  setSignedIn: (user) => set({ authStatus: 'signedIn', user, notStaffMessage: null }),
  setSignedOut: (message) =>
    set({ authStatus: 'signedOut', user: null, monitoring: null, dashboard: null, lastFix: null, notStaffMessage: message ?? null }),
  setOnboarded: (onboarded) => set({ onboarded }),
  setMonitoring: (monitoring) => set({ monitoring }),
  setOnline: (online) => set({ online }),
  setDashboard: (dashboard) => set({ dashboard }),
  setLastFix: (lastFix) => set({ lastFix }),
  setNotificationIntent: (notificationIntent) => set({ notificationIntent }),
}));
