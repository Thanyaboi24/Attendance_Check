import type { GeofenceConfig, LocationClass, Method, NotificationStatus, RequestStatus, RequestType, SyncStatus, UncertainReason } from '@attendance/shared';
import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';
import type {
  EventLogEntry,
  EventType,
  EvidencePurpose,
  EvidenceRecord,
  LocalActionKind,
  LocalRequest,
  NewOutboxEntry,
  OutboxEntry,
  OutboxKind,
  StateSnapshot,
} from '../../domain/models';
import type { LocalStore } from '../../domain/ports';

type Row = Record<string, string | number | null>;

interface ConfigRow {
  version: number;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_m: number;
  grace_period_sec: number;
  max_location_age_sec: number;
  max_accuracy_m: number;
  effective_at: string;
}

interface RequestRow {
  request_id: string;
  type: string;
  status: string;
  session_id: string | null;
  config_version: number;
  geofence_detected_at: string;
  notification_status: string | null;
  notification_posted_at: string | null;
  deadline_at: string;
  method: string | null;
  sync_status: string;
  local_action: string | null;
  last_classification: string | null;
  last_distance_m: number | null;
  resolution_reason: string | null;
  official_time: string | null;
  user_confirmed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface EvidenceRow {
  evidence_id: string;
  request_id: string | null;
  purpose: string;
  lat: number;
  lng: number;
  measured_at: string;
  accuracy_m: number | null;
  distance_m: number | null;
  classification: string;
  uncertain_reason: string | null;
  is_mock: number;
  created_at: string;
}

interface OutboxRow {
  id: number;
  request_id: string | null;
  kind: string;
  idempotency_key: string;
  payload_json: string;
  attempts: number;
  next_attempt_at: string;
  sync_status: string;
  last_error: string | null;
  created_at: string;
}

interface EventRow {
  id: number;
  at: string;
  type: string;
  request_id: string | null;
  detail_json: string;
}

const REQUEST_COLUMNS: Record<keyof Omit<LocalRequest, 'requestId'>, string> = {
  type: 'type',
  status: 'status',
  sessionId: 'session_id',
  configVersion: 'config_version',
  geofenceDetectedAt: 'geofence_detected_at',
  notificationStatus: 'notification_status',
  notificationPostedAt: 'notification_posted_at',
  deadlineAt: 'deadline_at',
  method: 'method',
  syncStatus: 'sync_status',
  localAction: 'local_action',
  lastClassification: 'last_classification',
  lastDistanceM: 'last_distance_m',
  resolutionReason: 'resolution_reason',
  officialTime: 'official_time',
  userConfirmedAt: 'user_confirmed_at',
  lastError: 'last_error',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

const toRequest = (r: RequestRow): LocalRequest => ({
  requestId: r.request_id,
  type: r.type as RequestType,
  status: r.status as RequestStatus,
  sessionId: r.session_id,
  configVersion: r.config_version,
  geofenceDetectedAt: r.geofence_detected_at,
  notificationStatus: r.notification_status as NotificationStatus | null,
  notificationPostedAt: r.notification_posted_at,
  deadlineAt: r.deadline_at,
  method: r.method as Method | null,
  syncStatus: r.sync_status as SyncStatus,
  localAction: r.local_action as LocalActionKind | null,
  lastClassification: r.last_classification as LocationClass | null,
  lastDistanceM: r.last_distance_m,
  resolutionReason: r.resolution_reason,
  officialTime: r.official_time,
  userConfirmedAt: r.user_confirmed_at,
  lastError: r.last_error,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toConfig = (r: ConfigRow): GeofenceConfig => ({
  version: r.version,
  name: r.name,
  centerLat: r.center_lat,
  centerLng: r.center_lng,
  radiusM: r.radius_m,
  gracePeriodSec: r.grace_period_sec,
  maxLocationAgeSec: r.max_location_age_sec,
  maxAccuracyM: r.max_accuracy_m,
  effectiveAt: r.effective_at,
});

const toEvidence = (r: EvidenceRow): EvidenceRecord => ({
  evidenceId: r.evidence_id,
  requestId: r.request_id,
  purpose: r.purpose as EvidencePurpose,
  lat: r.lat,
  lng: r.lng,
  measuredAt: r.measured_at,
  accuracyM: r.accuracy_m,
  distanceM: r.distance_m,
  classification: r.classification as LocationClass,
  uncertainReason: r.uncertain_reason as UncertainReason | null,
  isMock: r.is_mock === 1,
  createdAt: r.created_at,
});

const toOutbox = (r: OutboxRow): OutboxEntry => ({
  id: r.id,
  requestId: r.request_id,
  kind: r.kind as OutboxKind,
  idempotencyKey: r.idempotency_key,
  payload: JSON.parse(r.payload_json) as unknown,
  attempts: r.attempts,
  nextAttemptAt: r.next_attempt_at,
  status: r.sync_status === 'FAILED' ? 'FAILED' : 'PENDING',
  lastError: r.last_error,
  createdAt: r.created_at,
});

const bind = (v: unknown): SQLiteBindValue => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'string') return v;
  return JSON.stringify(v);
};

const SNAPSHOT_KEY = 'stateSnapshot';

/** LocalStore backed by expo-sqlite (design §10). */
export class SqliteLocalStore implements LocalStore {
  constructor(private readonly db: SQLiteDatabase) {}

  async saveConfig(cfg: GeofenceConfig) {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO config_cache
        (version, name, center_lat, center_lng, radius_m, grace_period_sec, max_location_age_sec, max_accuracy_m, effective_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cfg.version, cfg.name, cfg.centerLat, cfg.centerLng, cfg.radiusM, cfg.gracePeriodSec, cfg.maxLocationAgeSec, cfg.maxAccuracyM, cfg.effectiveAt, new Date().toISOString()],
    );
  }
  async getConfig(version: number) {
    const r = await this.db.getFirstAsync<ConfigRow>('SELECT * FROM config_cache WHERE version = ?', [version]);
    return r ? toConfig(r) : null;
  }
  async getLatestConfig() {
    const r = await this.db.getFirstAsync<ConfigRow>('SELECT * FROM config_cache ORDER BY version DESC LIMIT 1');
    return r ? toConfig(r) : null;
  }

  async insertRequest(req: LocalRequest) {
    const cols = ['request_id', ...Object.values(REQUEST_COLUMNS)];
    const values = [req.requestId, ...Object.keys(REQUEST_COLUMNS).map((k) => bind(req[k as keyof LocalRequest]))];
    await this.db.runAsync(
      `INSERT INTO attendance_request (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      values as SQLiteBindValue[],
    );
  }
  async getRequest(id: string) {
    const r = await this.db.getFirstAsync<RequestRow>('SELECT * FROM attendance_request WHERE request_id = ?', [id]);
    return r ? toRequest(r) : null;
  }
  async updateRequest(id: string, patch: Partial<Omit<LocalRequest, 'requestId'>>) {
    const keys = Object.keys(patch).filter((k) => k in REQUEST_COLUMNS) as Array<keyof typeof REQUEST_COLUMNS>;
    if (keys.length === 0) return;
    const sets = keys.map((k) => `${REQUEST_COLUMNS[k]} = ?`).join(', ');
    await this.db.runAsync(`UPDATE attendance_request SET ${sets} WHERE request_id = ?`, [...keys.map((k) => bind(patch[k])), id]);
  }
  async getActiveRequest() {
    const r = await this.db.getFirstAsync<RequestRow>(
      `SELECT * FROM attendance_request WHERE status = 'ACTIVE' AND local_action IS NULL ORDER BY created_at DESC LIMIT 1`,
    );
    return r ? toRequest(r) : null;
  }
  async listOpenRequests() {
    const rows = await this.db.getAllAsync<RequestRow>(`SELECT * FROM attendance_request WHERE status = 'ACTIVE' ORDER BY created_at ASC`);
    return rows.map(toRequest);
  }
  async listRequests(limit: number) {
    const rows = await this.db.getAllAsync<RequestRow>('SELECT * FROM attendance_request ORDER BY created_at DESC LIMIT ?', [limit]);
    return rows.map(toRequest);
  }

  async insertEvidence(e: EvidenceRecord) {
    await this.db.runAsync(
      `INSERT INTO location_evidence
        (evidence_id, request_id, purpose, lat, lng, measured_at, accuracy_m, distance_m, classification, uncertain_reason, is_mock, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.evidenceId, e.requestId, e.purpose, e.lat, e.lng, e.measuredAt, e.accuracyM, e.distanceM, e.classification, e.uncertainReason, e.isMock ? 1 : 0, e.createdAt],
    );
  }
  async listEvidence(requestId: string) {
    const rows = await this.db.getAllAsync<EvidenceRow>(
      'SELECT * FROM location_evidence WHERE request_id = ? ORDER BY created_at ASC',
      [requestId],
    );
    return rows.map(toEvidence);
  }

  async enqueueOutbox(entry: NewOutboxEntry, now: string) {
    const res = await this.db.runAsync(
      `INSERT INTO outbox_entry (request_id, kind, idempotency_key, payload_json, attempts, next_attempt_at, sync_status, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 'PENDING', ?)`,
      [entry.requestId, entry.kind, entry.idempotencyKey, JSON.stringify(entry.payload), now, now],
    );
    return res.lastInsertRowId;
  }
  async listOutbox() {
    const rows = await this.db.getAllAsync<OutboxRow>('SELECT * FROM outbox_entry ORDER BY id ASC');
    return rows.map(toOutbox);
  }
  async updateOutbox(id: number, patch: Partial<Pick<OutboxEntry, 'attempts' | 'nextAttemptAt' | 'status' | 'lastError'>>) {
    const map: Row = {};
    if (patch.attempts !== undefined) map.attempts = patch.attempts;
    if (patch.nextAttemptAt !== undefined) map.next_attempt_at = patch.nextAttemptAt;
    if (patch.status !== undefined) map.sync_status = patch.status;
    if (patch.lastError !== undefined) map.last_error = patch.lastError;
    const keys = Object.keys(map);
    if (keys.length === 0) return;
    await this.db.runAsync(`UPDATE outbox_entry SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [
      ...keys.map((k) => map[k] ?? null),
      id,
    ]);
  }
  async deleteOutbox(id: number) {
    await this.db.runAsync('DELETE FROM outbox_entry WHERE id = ?', [id]);
  }
  async hasPendingOutboxFor(requestId: string) {
    const r = await this.db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM outbox_entry WHERE request_id = ? AND sync_status = 'PENDING'`,
      [requestId],
    );
    return (r?.n ?? 0) > 0;
  }

  async saveSnapshot(s: StateSnapshot) {
    await this.setMeta(SNAPSHOT_KEY, JSON.stringify(s));
    for (const x of s.todaySessions) {
      await this.db.runAsync(
        `INSERT OR REPLACE INTO session_cache (session_id, check_in_at, check_in_method, check_out_at, check_out_method, status, corrected)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [x.id, x.checkInAt, x.checkInMethod, x.checkOutAt, x.checkOutMethod, x.status, x.corrected ? 1 : 0],
      );
    }
  }
  async getSnapshot() {
    const raw = await this.getMeta(SNAPSHOT_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StateSnapshot;
    } catch {
      return null;
    }
  }

  async getMeta(key: string) {
    const r = await this.db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
    return r?.value ?? null;
  }
  async setMeta(key: string, value: string | null) {
    if (value == null) await this.db.runAsync('DELETE FROM meta WHERE key = ?', [key]);
    else await this.db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
  }

  async logEvent(type: EventType, requestId: string | null, detail: Record<string, unknown>, at: string) {
    await this.db.runAsync('INSERT INTO event_log (at, type, request_id, detail_json) VALUES (?, ?, ?, ?)', [
      at,
      type,
      requestId,
      JSON.stringify(detail),
    ]);
  }
  async listEvents(limit = 5000) {
    const rows = await this.db.getAllAsync<EventRow>('SELECT * FROM event_log ORDER BY id DESC LIMIT ?', [limit]);
    return rows.reverse().map(
      (r): EventLogEntry => ({
        id: r.id,
        at: r.at,
        type: r.type as EventType,
        requestId: r.request_id,
        detail: safeJson(r.detail_json),
      }),
    );
  }

  async clearUserData() {
    await this.db.withTransactionAsync(async () => {
      await this.db.execAsync(
        `DELETE FROM attendance_request; DELETE FROM location_evidence; DELETE FROM outbox_entry; DELETE FROM session_cache;
         DELETE FROM meta WHERE key IN ('${SNAPSHOT_KEY}', 'registeredConfigVersion');`,
      );
    });
  }
}

function safeJson(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : { value: v };
  } catch {
    return { raw: s };
  }
}
