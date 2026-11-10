import { NOTIFICATION_TEXT, RequestType } from '@attendance/shared';
import * as Notifications from 'expo-notifications';
import type { Notifier, PresentResult } from '../../domain/ports';

/** Android channels (design §7.5). `location_check` is also used by the native foreground service. */
export const CHANNEL_REQUESTS = 'attendance_requests';
export const CHANNEL_LOCATION_CHECK = 'location_check';
export const CHANNEL_RESULTS = 'attendance_results';

export const CATEGORY_CHECK_IN = 'CHECK_IN_REQUEST';
export const CATEGORY_CHECK_OUT = 'CHECK_OUT_REQUEST';
export const ACTION_CHECK_IN = 'CHECK_IN';
export const ACTION_CHECK_OUT = 'CHECK_OUT';
export const ACTION_DISMISS = 'DISMISS';

export interface AttendanceNotificationData {
  requestId: string;
  requestType: RequestType;
  kind: 'ATTENDANCE_REQUEST' | 'INFO';
  [key: string]: unknown;
}

let setupDone: Promise<void> | null = null;

/** Channels + categories + foreground presentation. Idempotent; safe to call from headless tasks. */
export function setupNotifications(): Promise<void> {
  if (!setupDone) {
    setupDone = (async () => {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      await Notifications.setNotificationChannelAsync(CHANNEL_REQUESTS, {
        name: 'Attendance confirmation',
        description: 'Check-in / check-out confirmation requests',
        importance: Notifications.AndroidImportance.HIGH,
      });
      await Notifications.setNotificationChannelAsync(CHANNEL_RESULTS, {
        name: 'Attendance results',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
      await Notifications.setNotificationChannelAsync(CHANNEL_LOCATION_CHECK, {
        name: 'Location check',
        description: 'Shown while the app verifies your location in the background',
        importance: Notifications.AndroidImportance.LOW,
      });
      // Check In / Check Out open the app (fresh foreground fix, result visible — ADR-9). Dismiss does NOT cancel.
      await Notifications.setNotificationCategoryAsync(CATEGORY_CHECK_IN, [
        { identifier: ACTION_CHECK_IN, buttonTitle: 'Check In', options: { opensAppToForeground: true } },
        { identifier: ACTION_DISMISS, buttonTitle: 'Dismiss', options: { opensAppToForeground: false } },
      ]);
      await Notifications.setNotificationCategoryAsync(CATEGORY_CHECK_OUT, [
        { identifier: ACTION_CHECK_OUT, buttonTitle: 'Check Out', options: { opensAppToForeground: true } },
        { identifier: ACTION_DISMISS, buttonTitle: 'Dismiss', options: { opensAppToForeground: false } },
      ]);
    })().catch((e: unknown) => {
      setupDone = null;
      throw e;
    });
  }
  return setupDone;
}

export const expoNotifier: Notifier = {
  async presentAttendanceRequest({ requestId, type, graceSec }): Promise<PresentResult> {
    try {
      await setupNotifications();
      const perm = await Notifications.getPermissionsAsync();
      if (!perm.granted) return { status: 'FAILED', error: 'Notification permission not granted' };
      const text = type === RequestType.CHECK_IN ? NOTIFICATION_TEXT.CHECK_IN : NOTIFICATION_TEXT.CHECK_OUT;
      const minutes = Math.max(1, Math.round(graceSec / 60));
      const data: AttendanceNotificationData = { requestId, requestType: type, kind: 'ATTENDANCE_REQUEST' };
      await Notifications.scheduleNotificationAsync({
        identifier: requestId,
        content: {
          title: text.title,
          body: text.body.replace('{minutes}', String(minutes)),
          data,
          categoryIdentifier: type === RequestType.CHECK_IN ? CATEGORY_CHECK_IN : CATEGORY_CHECK_OUT,
          sticky: false,
          autoDismiss: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: { channelId: CHANNEL_REQUESTS },
      });
      return { status: 'POSTED', postedAt: new Date().toISOString() };
    } catch (e) {
      return { status: 'FAILED', error: e instanceof Error ? e.message : String(e) };
    }
  },
  async dismissAttendanceRequest(requestId) {
    await Notifications.dismissNotificationAsync(requestId);
  },
  async dismissAll() {
    await Notifications.dismissAllNotificationsAsync();
  },
  async showInfo({ title, body, requestId }) {
    try {
      await setupNotifications();
      await Notifications.scheduleNotificationAsync({
        identifier: requestId ? `result-${requestId}` : undefined,
        content: { title, body, data: { kind: 'INFO', requestId: requestId ?? null } },
        trigger: { channelId: CHANNEL_RESULTS },
      });
    } catch {
      /* informational only */
    }
  },
};
