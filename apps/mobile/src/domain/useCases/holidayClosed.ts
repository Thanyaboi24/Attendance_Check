import { type HolidayDto, RequestStatus, SyncStatus } from '@attendance/shared';
import { currentLanguage, t } from '../../i18n';
import { holidayName, rememberHoliday } from '../holidays';
import type { AppDeps } from '../ports';
import { changed, logEvent, nowIso, safe } from './common';

/** Resolution reason the backend uses for a check-in cancelled because the day is a holiday. */
export const HOLIDAY_REASON = 'HOLIDAY';

/**
 * The backend closed a check-in for a holiday (422 HOLIDAY_CHECK_IN_CLOSED on create/confirm/auto). This is a
 * definitive, expected answer — not a failure: the request ends as CANCELLED (reason HOLIDAY), everything still
 * queued for it is dropped (it can never succeed, so it is not retried), its grace job and notification go away
 * and the holiday is remembered locally so later geofence events are skipped even offline.
 */
export async function closeRequestForHoliday(
  deps: Pick<AppDeps, 'store' | 'scheduler' | 'notifier' | 'clock' | 'onLocalChange'>,
  requestId: string,
  holiday: HolidayDto | null,
  source: 'CREATE' | 'CONFIRM' | 'AUTO' | 'SYNC',
): Promise<void> {
  await deps.store.updateRequest(requestId, {
    status: RequestStatus.CANCELLED,
    resolutionReason: HOLIDAY_REASON,
    localAction: null,
    syncStatus: SyncStatus.SYNCED,
    lastError: null,
    updatedAt: nowIso(deps),
  });
  for (const e of await deps.store.listOutbox()) {
    if (e.requestId === requestId) await deps.store.deleteOutbox(e.id);
  }
  await safe(() => deps.scheduler.cancel(requestId));
  await safe(() => deps.notifier.dismissAttendanceRequest(requestId));
  if (holiday) await rememberHoliday(deps, holiday);
  await logEvent(deps, 'HOLIDAY_CLOSED', requestId, { source, date: holiday?.date ?? null, holidayId: holiday?.id ?? null });
  changed(deps);
}

/** Text of the "no need to come in today" message (current language). */
export function holidayMessage(holiday: HolidayDto | null): { title: string; body: string } {
  return {
    title: t('notifications:holiday.title'),
    body: holiday ? t('notifications:holiday.body', { name: holidayName(holiday, currentLanguage()) }) : t('notifications:holiday.bodyNoName'),
  };
}

/** Informational notification: today is a holiday, check-in is closed. Never throws. */
export async function notifyHolidayClosed(deps: Pick<AppDeps, 'notifier'>, holiday: HolidayDto | null, requestId?: string): Promise<void> {
  await safe(() => deps.notifier.showInfo({ ...holidayMessage(holiday), requestId }));
}
