/** Initial configuration parameters (design §2.4). The live values always come from the backend. */
export const DEFAULT_GEOFENCE = {
  radiusM: 150,
  gracePeriodSec: 300,
  maxLocationAgeSec: 60,
  maxAccuracyM: 30,
} as const;

export const RADIUS_MIN_M = 1;
export const RADIUS_MAX_M = 1000;

/** Display time zone; everything is stored and transported as UTC ISO-8601. */
export const DISPLAY_TIME_ZONE = 'Asia/Bangkok';

export const EARTH_RADIUS_M = 6_371_000;

/** GPS policy (design §16.3) */
export const LOCATION_POLICY = {
  freshFixTimeoutMs: 20_000,
  uncertainRetryCount: 2,
  uncertainRetryDelayMs: 30_000,
  mapWatchIntervalMs: 5_000,
} as const;

/** Tolerated client/server clock skew when the server checks that the grace period has expired. */
export const GRACE_CLOCK_SKEW_SEC = 30;

/** Requests still ACTIVE this long after their deadline are marked UNRESOLVED by the backend (design §17.7). */
export const STALE_REQUEST_AFTER_DEADLINE_SEC = 30 * 60;

/** Notification copy (DS2 §2.5.4–2.5.5). `{minutes}` is replaced with the grace period. */
export const NOTIFICATION_TEXT = {
  CHECK_IN: {
    title: 'Please confirm your check-in',
    body:
      'You appear to be within the faculty attendance area. ' +
      'If you do not respond within {minutes} minutes, the system will attempt automatic check-in after verifying your location again.',
  },
  CHECK_OUT: {
    title: 'Please confirm your check-out',
    body:
      'You appear to have left the faculty attendance area. ' +
      'If you do not respond within {minutes} minutes, the system will attempt automatic check-out after verifying your location again.',
  },
} as const;

export const API_PREFIX = '/api/v1';
