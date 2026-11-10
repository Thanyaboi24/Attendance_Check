import type {
  AttendanceActionResult,
  AttendanceRequestDto,
  AttendanceStateResponse,
  AutoAttendance,
  CancelAttendance,
  ConfirmAttendance,
  CorrectionDto,
  CreateAttendanceRequest,
  CreateCorrection,
  DeviceInfo,
  GeofenceConfig,
  HistoryResponse,
  LocationReading,
  LoginRequest,
  LoginResponse,
  NotificationEventInput,
  RequestType,
  SetPasswordWithToken,
  TokenPair,
  UnresolvedAttendance,
  UserProfile,
} from '@attendance/shared';
import type {
  EventLogEntry,
  EventType,
  EvidenceRecord,
  LocalRequest,
  NewOutboxEntry,
  OutboxEntry,
  StateSnapshot,
} from './models';

/**
 * Ports (hexagonal style). Use cases receive every dependency through an injected `deps` object so the
 * same code runs in the UI, in headless background tasks and in Jest with fakes (design §5, ADR-8).
 */

export interface Clock {
  now(): Date;
}

/** Backend attendance endpoints (docs/API.md). Implementations throw errors from `domain/errors`. */
export interface AttendanceApi {
  getState(): Promise<AttendanceStateResponse>;
  getActiveConfig(): Promise<GeofenceConfig>;
  getConfig(version: number): Promise<GeofenceConfig>;
  createRequest(body: CreateAttendanceRequest): Promise<AttendanceRequestDto>;
  confirm(requestId: string, body: ConfirmAttendance): Promise<AttendanceActionResult>;
  auto(requestId: string, body: AutoAttendance): Promise<AttendanceActionResult>;
  cancel(requestId: string, body: CancelAttendance): Promise<AttendanceActionResult>;
  unresolved(requestId: string, body: UnresolvedAttendance): Promise<AttendanceActionResult>;
  postNotificationEvent(body: NotificationEventInput): Promise<void>;
  history(from: string, to: string): Promise<HistoryResponse>;
  createCorrection(body: CreateCorrection): Promise<CorrectionDto>;
  listCorrections(): Promise<CorrectionDto[]>;
}

export interface AuthApi {
  login(body: LoginRequest): Promise<LoginResponse>;
  logout(refreshToken: string): Promise<void>;
  me(): Promise<UserProfile>;
  forgotPassword(email: string): Promise<void>;
  activate(body: SetPasswordWithToken): Promise<void>;
  resetPassword(body: SetPasswordWithToken): Promise<void>;
}

/** Tokens + signed-in profile (expo-secure-store / Android Keystore). Readable from headless tasks. */
export interface SessionStore {
  getTokens(): Promise<TokenPair | null>;
  setTokens(tokens: TokenPair): Promise<void>;
  getUser(): Promise<UserProfile | null>;
  setUser(user: UserProfile): Promise<void>;
  clear(): Promise<void>;
}

/** Local SQLite cache + outbox (design §10). */
export interface LocalStore {
  saveConfig(cfg: GeofenceConfig): Promise<void>;
  getConfig(version: number): Promise<GeofenceConfig | null>;
  /** Highest cached version. */
  getLatestConfig(): Promise<GeofenceConfig | null>;

  insertRequest(req: LocalRequest): Promise<void>;
  getRequest(requestId: string): Promise<LocalRequest | null>;
  updateRequest(requestId: string, patch: Partial<Omit<LocalRequest, 'requestId'>>): Promise<void>;
  /** Newest request with status ACTIVE and no queued local decision. */
  getActiveRequest(): Promise<LocalRequest | null>;
  /** Requests with status ACTIVE (any localAction), oldest first. */
  listOpenRequests(): Promise<LocalRequest[]>;
  /** Newest first. */
  listRequests(limit: number): Promise<LocalRequest[]>;

  insertEvidence(e: EvidenceRecord): Promise<void>;
  listEvidence(requestId: string): Promise<EvidenceRecord[]>;

  enqueueOutbox(entry: NewOutboxEntry, now: string): Promise<number>;
  /** All entries ordered by id (FIFO). */
  listOutbox(): Promise<OutboxEntry[]>;
  updateOutbox(id: number, patch: Partial<Pick<OutboxEntry, 'attempts' | 'nextAttemptAt' | 'status' | 'lastError'>>): Promise<void>;
  deleteOutbox(id: number): Promise<void>;
  hasPendingOutboxFor(requestId: string): Promise<boolean>;

  saveSnapshot(snapshot: StateSnapshot): Promise<void>;
  getSnapshot(): Promise<StateSnapshot | null>;

  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string | null): Promise<void>;

  logEvent(type: EventType, requestId: string | null, detail: Record<string, unknown>, at: string): Promise<void>;
  listEvents(limit?: number): Promise<EventLogEntry[]>;

  /** Remove all user-specific data (logout / different user signs in). The event log is kept for evaluation. */
  clearUserData(): Promise<void>;
}

/** Fresh fix via Fused Location (`getCurrentPositionAsync` Highest + timeout). Throws LocationUnavailableError. */
export interface LocationProvider {
  getFreshLocation(): Promise<LocationReading>;
}

export type PresentResult = { status: 'POSTED'; postedAt: string } | { status: 'FAILED'; error: string };

export interface Notifier {
  presentAttendanceRequest(input: { requestId: string; type: RequestType; graceSec: number }): Promise<PresentResult>;
  dismissAttendanceRequest(requestId: string): Promise<void>;
  dismissAll(): Promise<void>;
  /** Informational notification (result of an automatic decision). Never throws. */
  showInfo(input: { title: string; body: string; requestId?: string }): Promise<void>;
}

/** JS facade of the native `attendance-scheduler` module (WorkManager). */
export interface SchedulerPort {
  schedule(requestId: string, delayMs: number): Promise<void>;
  cancel(requestId: string): Promise<void>;
  cancelAll(): Promise<void>;
  /** One-off SyncTask when the network is connected. */
  scheduleSync(): Promise<void>;
}

export interface GeofenceMonitor {
  start(cfg: GeofenceConfig): Promise<void>;
  stop(): Promise<void>;
  isRunning(): Promise<boolean>;
}

export interface PermissionSnapshot {
  notifications: boolean;
  foregroundLocation: boolean;
  /** Android "precise" (fine) location; approximate makes every fix UNCERTAIN. */
  preciseLocation: boolean;
  /** "Allow all the time". */
  backgroundLocation: boolean;
  locationServices: boolean;
}

export interface PermissionsPort {
  check(): Promise<PermissionSnapshot>;
}

export interface AppDeps {
  api: AttendanceApi;
  authApi: AuthApi;
  store: LocalStore;
  session: SessionStore;
  location: LocationProvider;
  notifier: Notifier;
  scheduler: SchedulerPort;
  geofence: GeofenceMonitor;
  permissions: PermissionsPort;
  clock: Clock;
  uuid: () => string;
  sleep: (ms: number) => Promise<void>;
  device: () => DeviceInfo | undefined;
  /** Called after use cases change local data (UI refresh). Optional. */
  onLocalChange?: () => void;
}
