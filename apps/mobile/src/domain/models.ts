import type {
  LocationClass,
  Method,
  NotificationStatus,
  RequestStatus,
  RequestType,
  SessionDto,
  SyncStatus,
  UncertainReason,
} from '@attendance/shared';

/** Action the app decided locally for a request (sent, or queued in the outbox). */
export type LocalActionKind = 'CONFIRM' | 'AUTO' | 'CANCEL' | 'UNRESOLVED';

/**
 * Local copy of an AttendanceRequest (design §10, ATTENDANCE_REQUEST). The backend is the source of truth:
 * `status` only leaves ACTIVE after the backend answered. A decision that could not be sent yet is kept in
 * `localAction` with `syncStatus = PENDING_SYNC` ("Pending synchronization", never "Recorded").
 */
export interface LocalRequest {
  requestId: string;
  type: RequestType;
  status: RequestStatus;
  sessionId: string | null;
  /** Config version the request was created with; it is kept until the request finishes (DS2 §2.9.5). */
  configVersion: number;
  geofenceDetectedAt: string;
  notificationStatus: NotificationStatus | null;
  notificationPostedAt: string | null;
  deadlineAt: string;
  method: Method | null;
  syncStatus: SyncStatus;
  localAction: LocalActionKind | null;
  lastClassification: LocationClass | null;
  lastDistanceM: number | null;
  resolutionReason: string | null;
  officialTime: string | null;
  userConfirmedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EvidencePurpose = 'REVALIDATE' | 'MANUAL' | 'AUTO' | 'MAP';

export interface EvidenceRecord {
  evidenceId: string;
  requestId: string | null;
  purpose: EvidencePurpose;
  lat: number;
  lng: number;
  measuredAt: string;
  accuracyM: number | null;
  distanceM: number | null;
  classification: LocationClass;
  uncertainReason: UncertainReason | null;
  isMock: boolean;
  createdAt: string;
}

export type OutboxKind =
  | 'CREATE_REQUEST'
  | 'CONFIRM'
  | 'AUTO'
  | 'CANCEL'
  | 'UNRESOLVED'
  | 'NOTIFICATION_EVENT'
  | 'CORRECTION';

export interface OutboxEntry {
  /** Monotonic: entries are replayed in insertion order, so a request is always created before its action. */
  id: number;
  requestId: string | null;
  kind: OutboxKind;
  /** Sent as `Idempotency-Key`; equals the request id / correction id (docs/API.md). */
  idempotencyKey: string;
  payload: unknown;
  attempts: number;
  nextAttemptAt: string;
  status: 'PENDING' | 'FAILED';
  lastError: string | null;
  createdAt: string;
}

export type NewOutboxEntry = Pick<OutboxEntry, 'requestId' | 'kind' | 'idempotencyKey' | 'payload'>;

/** Last attendance state received from the backend (`GET /attendance/state`). */
export interface StateSnapshot {
  openSession: SessionDto | null;
  todaySessions: SessionDto[];
  activeConfigVersion: number | null;
  serverTime: string;
  fetchedAt: string;
}

/** Evaluation event log (design §8.3, §14): exported as CSV/JSON from the Settings screen. */
export type EventType =
  | 'GEOFENCE_TRANSITION'
  | 'GEOFENCE_ERROR'
  | 'TRANSITION_IGNORED'
  | 'REQUEST_CREATED'
  | 'REQUEST_REJECTED'
  | 'NOTIFICATION_POSTED'
  | 'NOTIFICATION_FAILED'
  | 'NOTIFICATION_RESPONDED'
  | 'NOTIFICATION_DISMISSED'
  | 'LOCATION_FIX'
  | 'LOCATION_UNAVAILABLE'
  | 'REVALIDATION'
  | 'GRACE_TASK_STARTED'
  | 'AUTO_DECISION'
  | 'MANUAL_DECISION'
  | 'ACTION_SENT'
  | 'ACTION_RESULT'
  | 'ACTION_QUEUED'
  | 'ACTION_ERROR'
  | 'OUTBOX_SYNCED'
  | 'OUTBOX_RETRY'
  | 'OUTBOX_FAILED'
  | 'CONFIG_FETCHED'
  | 'CONFIG_FALLBACK'
  | 'MONITORING_STARTED'
  | 'MONITORING_STOPPED'
  | 'MONITORING_UNAVAILABLE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'BOOTSTRAP';

export interface EventLogEntry {
  id: number;
  at: string;
  type: EventType;
  requestId: string | null;
  detail: Record<string, unknown>;
}
