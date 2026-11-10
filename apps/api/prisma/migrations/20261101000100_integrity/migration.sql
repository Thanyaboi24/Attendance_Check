-- Data integrity rules enforced by the database itself (DS2 §2.9.3, design §17.5).
-- Prisma's schema language cannot express partial unique indexes or CHECK constraints.

-- Rule 2: at most one open attendance session per user.
CREATE UNIQUE INDEX "one_open_session_per_user"
  ON "AttendanceSession" ("userId") WHERE "status" = 'OPEN';

-- At most one ACTIVE attendance request per user (DS2 §2.6.5).
CREATE UNIQUE INDEX "one_active_request_per_user"
  ON "AttendanceRequest" ("userId") WHERE "status" = 'ACTIVE';

-- Rule 4: check-out cannot precede check-in.
ALTER TABLE "AttendanceSession"
  ADD CONSTRAINT "checkout_after_checkin" CHECK ("checkOutAt" IS NULL OR "checkOutAt" >= "checkInAt");

-- A completed session has a check-out; an open one does not.
ALTER TABLE "AttendanceSession"
  ADD CONSTRAINT "session_status_consistent" CHECK (
    ("status" = 'OPEN' AND "checkOutAt" IS NULL AND "checkOutMethod" IS NULL) OR
    ("status" = 'COMPLETED' AND "checkOutAt" IS NOT NULL AND "checkOutMethod" IS NOT NULL)
  );

-- Rule 5: each request produces at most one successful action; an approved request has its official time.
ALTER TABLE "AttendanceRequest"
  ADD CONSTRAINT "approved_has_time_and_method" CHECK (
    "status" <> 'APPROVED' OR ("approvedAt" IS NOT NULL AND "method" IS NOT NULL AND "sessionId" IS NOT NULL)
  );

-- Supported geofence parameters.
ALTER TABLE "GeofenceConfiguration"
  ADD CONSTRAINT "radius_range" CHECK ("radiusM" BETWEEN 1 AND 1000),
  ADD CONSTRAINT "grace_positive" CHECK ("gracePeriodSec" > 0),
  ADD CONSTRAINT "thresholds_positive" CHECK ("maxLocationAgeSec" > 0 AND "maxAccuracyM" > 0),
  ADD CONSTRAINT "center_valid" CHECK ("centerLat" BETWEEN -90 AND 90 AND "centerLng" BETWEEN -180 AND 180);

-- Correction requests ask for a sane time range.
ALTER TABLE "CorrectionRequest"
  ADD CONSTRAINT "correction_times_ordered" CHECK (
    "requestedCheckInAt" IS NULL OR "requestedCheckOutAt" IS NULL OR "requestedCheckOutAt" >= "requestedCheckInAt"
  );

-- The audit trail is append-only.
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_log_no_update_delete"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
