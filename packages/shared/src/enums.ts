/**
 * Enumerations shared by the mobile app, the API (mirrors the Prisma enums) and the admin web.
 * Kept as `as const` objects so they work as both runtime values and string-literal types.
 */

export const Role = {
  STAFF: 'STAFF',
  ATTENDANCE_ADMIN: 'ATTENDANCE_ADMIN',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const AccountStatus = {
  PENDING_ACTIVATION: 'PENDING_ACTIVATION',
  ACTIVE: 'ACTIVE',
  DEACTIVATED: 'DEACTIVATED',
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

export const RequestType = { CHECK_IN: 'CHECK_IN', CHECK_OUT: 'CHECK_OUT' } as const;
export type RequestType = (typeof RequestType)[keyof typeof RequestType];

/** DS2 §2.7.1 / design §8.1 */
export const RequestStatus = {
  ACTIVE: 'ACTIVE',
  APPROVED: 'APPROVED',
  CANCELLED: 'CANCELLED',
  UNRESOLVED: 'UNRESOLVED',
  REJECTED: 'REJECTED',
} as const;
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];

export const Method = {
  MANUAL: 'MANUAL',
  AUTOMATIC: 'AUTOMATIC',
  ADMIN_CORRECTED: 'ADMIN_CORRECTED',
} as const;
export type Method = (typeof Method)[keyof typeof Method];

export const SessionStatus = { OPEN: 'OPEN', COMPLETED: 'COMPLETED' } as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export const LocationClass = {
  CONFIRMED_INSIDE: 'CONFIRMED_INSIDE',
  CONFIRMED_OUTSIDE: 'CONFIRMED_OUTSIDE',
  UNCERTAIN: 'UNCERTAIN',
} as const;
export type LocationClass = (typeof LocationClass)[keyof typeof LocationClass];

export const NotificationStatus = {
  POSTED: 'POSTED',
  FAILED: 'FAILED',
} as const;
export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];

export const NotificationEventType = {
  POSTED: 'POSTED',
  FAILED: 'FAILED',
  RESPONDED: 'RESPONDED',
  DISMISSED: 'DISMISSED',
} as const;
export type NotificationEventType = (typeof NotificationEventType)[keyof typeof NotificationEventType];

export const CorrectionStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type CorrectionStatus = (typeof CorrectionStatus)[keyof typeof CorrectionStatus];

/** Client-side synchronisation status (design §8.1) */
export const SyncStatus = { SYNCED: 'SYNCED', PENDING_SYNC: 'PENDING_SYNC', FAILED: 'FAILED' } as const;
export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];

/** Derived attendance state shown on the staff dashboard (design §8.1) */
export const AttendanceState = {
  CHECKED_OUT: 'CHECKED_OUT',
  PENDING_CHECK_IN: 'PENDING_CHECK_IN',
  CHECKED_IN: 'CHECKED_IN',
  PENDING_CHECK_OUT: 'PENDING_CHECK_OUT',
} as const;
export type AttendanceState = (typeof AttendanceState)[keyof typeof AttendanceState];

export const GeofenceTransition = { ENTER: 'ENTER', EXIT: 'EXIT' } as const;
export type GeofenceTransition = (typeof GeofenceTransition)[keyof typeof GeofenceTransition];

/** Machine-readable error codes returned by the API in `{ code, message }` bodies. */
export const ErrorCode = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  TOKEN_INVALID: 'TOKEN_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  IDEMPOTENCY_KEY_MISMATCH: 'IDEMPOTENCY_KEY_MISMATCH',
  ACTIVE_REQUEST_EXISTS: 'ACTIVE_REQUEST_EXISTS',
  SESSION_ALREADY_OPEN: 'SESSION_ALREADY_OPEN',
  NO_OPEN_SESSION: 'NO_OPEN_SESSION',
  REQUEST_NOT_ACTIVE: 'REQUEST_NOT_ACTIVE',
  LOCATION_NOT_CONFIRMED: 'LOCATION_NOT_CONFIRMED',
  MOCK_LOCATION: 'MOCK_LOCATION',
  GRACE_PERIOD_NOT_EXPIRED: 'GRACE_PERIOD_NOT_EXPIRED',
  NOTIFICATION_NOT_POSTED: 'NOTIFICATION_NOT_POSTED',
  CONFIG_VERSION_UNKNOWN: 'CONFIG_VERSION_UNKNOWN',
  CORRECTION_NOT_PENDING: 'CORRECTION_NOT_PENDING',
  INVALID_TIME_RANGE: 'INVALID_TIME_RANGE',
  DUPLICATE_USER: 'DUPLICATE_USER',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
