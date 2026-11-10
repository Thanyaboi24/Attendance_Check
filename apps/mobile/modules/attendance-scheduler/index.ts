import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * JS API of the native `attendance-scheduler` Expo module (Kotlin, WorkManager + HeadlessJsTaskService).
 *
 *   schedule(requestId, delayMs) → OneTimeWorkRequest, unique name = requestId, ExistingWorkPolicy.KEEP;
 *                                   when it fires, the headless task `GracePeriodTask({ requestId })` runs.
 *   cancel(requestId)            → cancels that unique work.
 *   cancelAll()                  → cancels every grace job (logout).
 *   scheduleSync()               → one-off `SyncTask` with a NetworkType.CONNECTED constraint.
 *
 * When the native module is absent (Jest, Expo Go, web) every call is a no-op with a console warning.
 */
interface NativeAttendanceScheduler {
  schedule(requestId: string, delayMs: number): Promise<void>;
  cancel(requestId: string): Promise<void>;
  cancelAll(): Promise<void>;
  scheduleSync(): Promise<void>;
  isAvailable(): boolean;
}

const native = requireOptionalNativeModule<NativeAttendanceScheduler>('AttendanceScheduler');

let warned = false;
function fallback(op: string): Promise<void> {
  if (!warned) {
    warned = true;
    console.warn(
      `[attendance-scheduler] native module not available; "${op}" ignored. ` +
        'Grace-period automation needs a development build (npx expo run:android).',
    );
  }
  return Promise.resolve();
}

export const isNativeSchedulerAvailable = native != null;

export function schedule(requestId: string, delayMs: number): Promise<void> {
  return native ? native.schedule(requestId, Math.max(0, Math.round(delayMs))) : fallback('schedule');
}

export function cancel(requestId: string): Promise<void> {
  return native ? native.cancel(requestId) : fallback('cancel');
}

export function cancelAll(): Promise<void> {
  return native ? native.cancelAll() : fallback('cancelAll');
}

export function scheduleSync(): Promise<void> {
  return native ? native.scheduleSync() : fallback('scheduleSync');
}

/** Headless task names started by the native side. */
export const HEADLESS_TASKS = {
  GRACE_PERIOD: 'GracePeriodTask',
  SYNC: 'SyncTask',
  BOOT: 'BootTask',
} as const;
