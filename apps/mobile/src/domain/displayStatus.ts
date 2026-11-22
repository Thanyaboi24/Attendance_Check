import { RequestStatus, SyncStatus } from '@attendance/shared';
import { t } from '../i18n';
import type { LocalRequest } from './models';

/**
 * The five user-visible statuses the UI must keep apart (DS2 §2.10.4, design §12.4):
 * Recorded · Pending · Uncertain location · Failed · Unsynchronized — plus Cancelled (no record needed).
 */
export type DisplayStatus = 'RECORDED' | 'PENDING' | 'UNCERTAIN_LOCATION' | 'FAILED' | 'UNSYNCHRONIZED' | 'CANCELLED';

export function displayStatusOf(r: Pick<LocalRequest, 'status' | 'syncStatus' | 'localAction' | 'resolutionReason'>): DisplayStatus {
  // A decision that has not reached the backend is never shown as recorded.
  if (r.localAction != null) return 'UNSYNCHRONIZED';
  if (r.syncStatus === SyncStatus.FAILED) return 'FAILED';
  switch (r.status) {
    case RequestStatus.APPROVED:
      return r.syncStatus === SyncStatus.SYNCED ? 'RECORDED' : 'UNSYNCHRONIZED';
    case RequestStatus.ACTIVE:
      return 'PENDING';
    case RequestStatus.CANCELLED:
      return 'CANCELLED';
    case RequestStatus.UNRESOLVED:
      return r.resolutionReason === 'UNCERTAIN_LOCATION' || r.resolutionReason === 'LOCATION_UNAVAILABLE'
        ? 'UNCERTAIN_LOCATION'
        : 'FAILED';
    case RequestStatus.REJECTED:
      return 'FAILED';
  }
}

const DISPLAY_STATUSES: readonly DisplayStatus[] = ['RECORDED', 'PENDING', 'UNCERTAIN_LOCATION', 'FAILED', 'UNSYNCHRONIZED', 'CANCELLED'];

/** Label of a display status in the current language. */
export function displayLabel(status: DisplayStatus): string {
  return t(`common:displayStatus.${status}`);
}

/** Same as `displayLabel`, as a lookup table; every read follows the current language. */
export const DISPLAY_LABEL: Readonly<Record<DisplayStatus, string>> = Object.defineProperties(
  {} as Record<DisplayStatus, string>,
  Object.fromEntries(DISPLAY_STATUSES.map((s) => [s, { get: () => displayLabel(s), enumerable: true }])),
);

const REASON_CODES = [
  'UNCERTAIN_LOCATION',
  'LOCATION_UNAVAILABLE',
  'NOTIFICATION_FAILED',
  'INVALID_STATE',
  'CONFIRMED_OPPOSITE_SIDE',
  'MOCK_LOCATION',
  'SESSION_ALREADY_OPEN',
  'NO_OPEN_SESSION',
  'ACTIVE_REQUEST_EXISTS',
  'SUPERSEDED',
  'LOCATION_NOT_CONFIRMED',
  'CONFIG_VERSION_UNKNOWN',
  'HOLIDAY',
  'HOLIDAY_CHECK_IN_CLOSED',
] as const;
type ReasonCode = (typeof REASON_CODES)[number];
const isReasonCode = (c: string): c is ReasonCode => (REASON_CODES as readonly string[]).includes(c);

/** Human explanation for resolution / error codes (current language; unknown codes are shown as is). */
export function reasonText(code: string | null | undefined): string | null {
  if (code == null) return null;
  return isReasonCode(code) ? t(`common:reason.${code}`) : code;
}

const UNCERTAIN_REASONS = ['STALE_READING', 'LOW_ACCURACY', 'STRADDLES_BOUNDARY', 'MISSING_DATA'] as const;
type UncertainReasonKey = (typeof UNCERTAIN_REASONS)[number];

export function uncertainReasonText(reason: string | null | undefined): string {
  const key: UncertainReasonKey | 'OTHER' =
    reason != null && (UNCERTAIN_REASONS as readonly string[]).includes(reason) ? (reason as UncertainReasonKey) : 'OTHER';
  return t(`common:uncertainReason.${key}`);
}
