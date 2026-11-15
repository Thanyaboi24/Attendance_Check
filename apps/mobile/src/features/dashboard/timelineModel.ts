import { formatBangkokTime, type Method, RequestStatus, RequestType, type SessionDto, toBangkokDate } from '@attendance/shared';
import type { LocalRequest } from '../../domain/models';
import { t } from '../../i18n';

export type TimelineTone = 'neutral' | 'pending' | 'success' | 'problem';

export interface TimelineItem {
  at: string;
  time: string;
  text: string;
  tone: TimelineTone;
}

/** Lower-case method word inside a timeline line ("Checked in · manual"), current language. */
export function methodText(method: Method | null | undefined): string {
  return method ? t(`dashboard:timeline.method.${method}`) : t('dashboard:timeline.method.recorded');
}

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
    const kind = isIn ? 'CHECK_IN' : 'CHECK_OUT';
    if (isToday(r.geofenceDetectedAt)) add(r.geofenceDetectedAt, t(isIn ? 'dashboard:timeline.enteredArea' : 'dashboard:timeline.leftArea'), 'neutral');
    if (isToday(r.notificationPostedAt)) add(r.notificationPostedAt, t(`dashboard:timeline.${kind}.requestSent`), 'pending');
    else if (r.notificationStatus === 'FAILED' && isToday(r.geofenceDetectedAt)) add(r.geofenceDetectedAt, t(`dashboard:timeline.${kind}.notificationFailed`), 'problem');
    if (!isToday(r.updatedAt)) continue;
    if (r.status === RequestStatus.UNRESOLVED) {
      const uncertain = r.resolutionReason === 'UNCERTAIN_LOCATION';
      add(r.updatedAt, t(uncertain ? `dashboard:timeline.${kind}.notRecordedUncertain` : `dashboard:timeline.${kind}.notRecorded`), 'problem');
    } else if (r.status === RequestStatus.REJECTED) {
      add(r.updatedAt, t(`dashboard:timeline.${kind}.rejected`), 'problem');
    } else if (r.status === RequestStatus.CANCELLED) {
      add(r.updatedAt, t(`dashboard:timeline.${kind}.cancelled`), 'neutral');
    }
  }

  for (const s of sessions) {
    if (isToday(s.checkInAt)) add(s.checkInAt, t('dashboard:timeline.checkedIn', { method: methodText(s.checkInMethod) }), 'success');
    if (isToday(s.checkOutAt)) add(s.checkOutAt, t('dashboard:timeline.checkedOut', { method: methodText(s.checkOutMethod) }), 'success');
  }

  return items.sort((a, b) => a.at.localeCompare(b.at));
}
