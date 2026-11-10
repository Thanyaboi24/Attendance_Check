/**
 * Local SQLite schema (design §10): cache + outbox only — the official record lives on the backend.
 *
 * Chosen approach: plain typed SQL with a tiny `PRAGMA user_version` migration runner instead of Drizzle ORM.
 * It keeps the background (headless) code path free of an extra ORM/bundler setup and is trivial to audit.
 * Migrations are append-only: never edit a shipped entry, add a new one.
 */
export const MIGRATIONS: readonly string[] = [
  // v1
  `
  CREATE TABLE IF NOT EXISTS config_cache (
    version              INTEGER PRIMARY KEY NOT NULL,
    name                 TEXT    NOT NULL,
    center_lat           REAL    NOT NULL,
    center_lng           REAL    NOT NULL,
    radius_m             INTEGER NOT NULL,
    grace_period_sec     INTEGER NOT NULL,
    max_location_age_sec INTEGER NOT NULL,
    max_accuracy_m       INTEGER NOT NULL,
    effective_at         TEXT    NOT NULL,
    fetched_at           TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attendance_request (
    request_id             TEXT PRIMARY KEY NOT NULL,
    type                   TEXT NOT NULL CHECK (type IN ('CHECK_IN','CHECK_OUT')),
    status                 TEXT NOT NULL CHECK (status IN ('ACTIVE','APPROVED','CANCELLED','UNRESOLVED','REJECTED')),
    session_id             TEXT,
    config_version         INTEGER NOT NULL,
    geofence_detected_at   TEXT NOT NULL,
    notification_status    TEXT,
    notification_posted_at TEXT,
    deadline_at            TEXT NOT NULL,
    method                 TEXT,
    sync_status            TEXT NOT NULL,
    local_action           TEXT,
    last_classification    TEXT,
    last_distance_m        REAL,
    resolution_reason      TEXT,
    official_time          TEXT,
    user_confirmed_at      TEXT,
    last_error             TEXT,
    created_at             TEXT NOT NULL,
    updated_at             TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_request_status ON attendance_request (status, created_at);

  CREATE TABLE IF NOT EXISTS location_evidence (
    evidence_id      TEXT PRIMARY KEY NOT NULL,
    request_id       TEXT,
    purpose          TEXT NOT NULL,
    lat              REAL NOT NULL,
    lng              REAL NOT NULL,
    measured_at      TEXT NOT NULL,
    accuracy_m       REAL,
    distance_m       REAL,
    classification   TEXT NOT NULL,
    uncertain_reason TEXT,
    is_mock          INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_evidence_request ON location_evidence (request_id);

  CREATE TABLE IF NOT EXISTS outbox_entry (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id      TEXT,
    kind            TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    payload_json    TEXT NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT NOT NULL,
    sync_status     TEXT NOT NULL DEFAULT 'PENDING',
    last_error      TEXT,
    created_at      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_outbox_request ON outbox_entry (request_id);

  CREATE TABLE IF NOT EXISTS session_cache (
    session_id       TEXT PRIMARY KEY NOT NULL,
    check_in_at      TEXT NOT NULL,
    check_in_method  TEXT NOT NULL,
    check_out_at     TEXT,
    check_out_method TEXT,
    status           TEXT NOT NULL,
    corrected        INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS event_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    at          TEXT NOT NULL,
    type        TEXT NOT NULL,
    request_id  TEXT,
    detail_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_event_at ON event_log (at);

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

/** Minimal surface of expo-sqlite used by the runner (keeps it testable). */
export interface MigratableDb {
  execAsync(sql: string): Promise<void>;
  getFirstAsync<T>(sql: string): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export async function migrate(db: MigratableDb, migrations: readonly string[] = MIGRATIONS): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < migrations.length) {
    const sql = migrations[version] as string;
    const next = version + 1;
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
  return version;
}
