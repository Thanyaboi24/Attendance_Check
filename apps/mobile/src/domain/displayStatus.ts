import { RequestStatus, SyncStatus } from '@attendance/shared';
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

export const DISPLAY_LABEL: Record<DisplayStatus, string> = {
  RECORDED: 'Recorded',
  PENDING: 'Pending',
  UNCERTAIN_LOCATION: 'Uncertain location',
  FAILED: 'Failed',
  UNSYNCHRONIZED: 'Pending synchronization',
  CANCELLED: 'Cancelled',
};

/** Human explanation for resolution / error codes. */
export function reasonText(code: string | null | undefined): string | null {
  switch (code) {
    case null:
    case undefined:
      return null;
    case 'UNCERTAIN_LOCATION':
      return 'Your location could not be verified (accuracy too low, reading too old, or near the boundary).';
    case 'LOCATION_UNAVAILABLE':
      return 'No location fix could be obtained (location services off, permission missing or timeout).';
    case 'NOTIFICATION_FAILED':
      return 'The confirmation notification could not be shown, so automatic attendance was not allowed.';
    case 'INVALID_STATE':
      return 'Your attendance state changed before this request finished.';
    case 'CONFIRMED_OPPOSITE_SIDE':
      return 'You were confirmed on the other side of the attendance area.';
    case 'MOCK_LOCATION':
      return 'A mock (simulated) location was detected. The request was rejected.';
    case 'SESSION_ALREADY_OPEN':
      return 'You are already checked in.';
    case 'NO_OPEN_SESSION':
      return 'You are not checked in.';
    case 'ACTIVE_REQUEST_EXISTS':
      return 'Another attendance request is still pending.';
    case 'SUPERSEDED':
      return 'Replaced by a newer request.';
    case 'LOCATION_NOT_CONFIRMED':
      return 'The server could not confirm your location for this request.';
    case 'CONFIG_VERSION_UNKNOWN':
      return 'The geofence configuration used by this request is unknown to the server.';
    default:
      return code;
  }
}

export function uncertainReasonText(reason: string | null | undefined): string {
  switch (reason) {
    case 'STALE_READING':
      return 'The location reading was too old.';
    case 'LOW_ACCURACY':
      return 'The location accuracy was too low (more than the allowed uncertainty).';
    case 'STRADDLES_BOUNDARY':
      return 'You are too close to the boundary to be sure which side you are on.';
    case 'MISSING_DATA':
      return 'The location reading was incomplete.';
    default:
      return 'Your location was not on the expected side of the attendance area.';
  }
}
