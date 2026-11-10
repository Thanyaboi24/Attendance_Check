import { formatBangkokTime, type Method, RequestStatus, RequestType, type SessionDto, toBangkokDate } from '@attendance/shared';
import type { LocalRequest } from '../../domain/models';

export type TimelineTone = 'neutral' | 'pending' | 'success' | 'problem';

export interface TimelineItem {
  at: string;
  time: string;
  text: string;
  tone: TimelineTone;
}

export const METHOD_TEXT: Record<Method, string> = {
  MANUAL: 'manual',
  AUTOMATIC: 'automatic',
  ADMIN_CORRECTED: 'admin corrected',
};

type RequestLike = Pick<
  LocalRequest,
  'requestId' | 'type' | 'status' | 'geofenceDetectedAt' | 'notificationPostedAt' | 'notificationStatus' | 'resolutionReason' | 'updatedAt'
>;

/**
 * "Today" list on the home screen (mockup page 3): geofence transitions, notifications, recorded check-in /
 * check-out (from the server's sessions) and requests that ended without a record. Bangkok calendar day.
 */
export function buildTodayTimeline(requests: RequestLike[], sessions: SessionDto[], now: Date): TimelineItem[] {
  const today = toBangkokDate(now);
  const isToday = (iso: string | null | undefined): iso is string => iso != null && toBangkokDate(iso) === today;
  const items: TimelineItem[] = [];
  const add = (at: string, text: string, tone: TimelineTone) => items.push({ at, time: formatBangkokTime(at), text, tone });

  for (const r of requests) {
    const isIn = r.type === RequestType.CHECK_IN;
    const word = isIn ? 'Check-in' : 'Check-out';
    if (isToday(r.geofenceDetectedAt)) add(r.geofenceDetectedAt, isIn ? 'Entered faculty area' : 'Left faculty area', 'neutral');
    if (isToday(r.notificationPostedAt)) add(r.notificationPostedAt, `${word} request sent`, 'pending');
    else if (r.notificationStatus === 'FAILED' && isToday(r.geofenceDetectedAt)) add(r.geofenceDetectedAt, `${word} notification could not be shown`, 'problem');
    if (!isToday(r.updatedAt)) continue;
    if (r.status === RequestStatus.UNRESOLVED) {
      const why = r.resolutionReason === 'UNCERTAIN_LOCATION' ? ' · uncertain location' : '';
      add(r.updatedAt, `${word} not recorded${why}`, 'problem');
    } else if (r.status === RequestStatus.REJECTED) {
      add(r.updatedAt, `${word} rejected`, 'problem');
    } else if (r.status === RequestStatus.CANCELLED) {
      add(r.updatedAt, `${word} request cancelled`, 'neutral');
    }
  }

  for (const s of sessions) {
    if (isToday(s.checkInAt)) add(s.checkInAt, `Checked in · ${METHOD_TEXT[s.checkInMethod]}`, 'success');
    if (isToday(s.checkOutAt)) add(s.checkOutAt, `Checked out · ${s.checkOutMethod ? METHOD_TEXT[s.checkOutMethod] : 'recorded'}`, 'success');
  }

  return items.sort((a, b) => a.at.localeCompare(b.at));
}
