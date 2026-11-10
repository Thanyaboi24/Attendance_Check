import { NotificationEventType } from '@attendance/shared';
import * as Notifications from 'expo-notifications';
import { META_ONBOARDED, recordNotificationEvent } from '../domain/useCases/common';
import { ADMIN_WEB_MESSAGE, bootstrap } from '../domain/useCases/auth';
import { ensureMonitoring } from '../domain/useCases/monitoring';
import { getActiveConfig } from '../domain/useCases/common';
import { syncOutbox } from '../domain/useCases/syncOutbox';
import { loadDashboardModel } from '../features/dashboard/dashboardModel';
import { ACTION_CHECK_IN, ACTION_CHECK_OUT, ACTION_DISMISS, type AttendanceNotificationData } from '../services/notifications';
import { useAppStore } from '../store/appStore';
import { logger } from '../utils/logger';
import { getDeps } from './container';

/** Glue between the UI store and the use cases (foreground only). */

let refreshQueued: Promise<void> | null = null;

export function refreshDashboard(): Promise<void> {
  if (!refreshQueued) {
    refreshQueued = (async () => {
      try {
        const deps = await getDeps();
        useAppStore.getState().setDashboard(await loadDashboardModel(deps));
      } catch (e) {
        logger.warn('dashboard refresh failed', e);
      } finally {
        refreshQueued = null;
      }
    })();
  }
  return refreshQueued;
}

export async function runBootstrap(reason: 'APP_START' | 'FOREGROUND'): Promise<void> {
  const store = useAppStore.getState();
  try {
    const deps = await getDeps();
    const onboarded = (await deps.store.getMeta(META_ONBOARDED)) === '1';
    store.setOnboarded(onboarded);
    const out = await bootstrap(deps, { reason });
    if (out.kind === 'SIGNED_OUT') store.setSignedOut();
    else if (out.kind === 'NOT_STAFF') store.setSignedOut(ADMIN_WEB_MESSAGE);
    else {
      store.setSignedIn(out.user);
      store.setMonitoring(out.monitoring);
      store.setOnline(out.online);
    }
  } catch (e) {
    logger.error('bootstrap failed', e);
    if (useAppStore.getState().authStatus === 'unknown') store.setSignedOut();
  }
  await refreshDashboard();
}

/** Re-checks permissions and (re-)registers the geofence; used after the permission screen. */
export async function refreshMonitoring(force = false): Promise<void> {
  const deps = await getDeps();
  const cfg = await getActiveConfig(deps, { refresh: true });
  useAppStore.getState().setMonitoring(await ensureMonitoring(deps, cfg, { force }));
}

export async function syncNow(): Promise<void> {
  try {
    const deps = await getDeps();
    await syncOutbox(deps);
  } catch (e) {
    logger.warn('sync failed', e);
  }
  await refreshDashboard();
}

const handledResponses = new Set<string>();

/**
 * Notification responses. Check In / Check Out open the app and hand the request to the dashboard, which takes a
 * fresh foreground fix and confirms (ADR-9). Dismiss only dismisses — it never cancels the request or the grace job.
 */
export async function handleNotificationResponse(resp: Notifications.NotificationResponse): Promise<void> {
  const data = resp.notification.request.content.data as Partial<AttendanceNotificationData> | null;
  const key = `${resp.notification.request.identifier}:${resp.actionIdentifier}:${resp.notification.date}`;
  if (handledResponses.has(key)) return;
  handledResponses.add(key);
  if (!data || data.kind !== 'ATTENDANCE_REQUEST' || typeof data.requestId !== 'string') return;
  const requestId = data.requestId;
  const at = new Date().toISOString();
  const store = useAppStore.getState();

  if (resp.actionIdentifier === ACTION_DISMISS) {
    await Notifications.dismissNotificationAsync(resp.notification.request.identifier).catch(() => undefined);
    try {
      const deps = await getDeps();
      await recordNotificationEvent(deps, { requestId, type: NotificationEventType.DISMISSED, occurredAt: at, action: 'DISMISS' });
    } catch {
      /* evaluation only */
    }
    return;
  }
  if (resp.actionIdentifier === ACTION_CHECK_IN || resp.actionIdentifier === ACTION_CHECK_OUT) {
    store.setNotificationIntent({ requestId, action: resp.actionIdentifier, at });
    return;
  }
  // Tap on the notification body: open the dashboard, the user decides there.
  store.setNotificationIntent({ requestId, action: 'OPEN', at });
}
