import * as AttendanceScheduler from '../../../modules/attendance-scheduler';
import type { SchedulerPort } from '../../domain/ports';

/** JS wrapper of the native attendance-scheduler module (design §7.6). */
export const nativeScheduler: SchedulerPort = {
  schedule: (requestId, delayMs) => AttendanceScheduler.schedule(requestId, delayMs),
  cancel: (requestId) => AttendanceScheduler.cancel(requestId),
  cancelAll: () => AttendanceScheduler.cancelAll(),
  scheduleSync: () => AttendanceScheduler.scheduleSync(),
};

export const isSchedulerAvailable = AttendanceScheduler.isNativeSchedulerAvailable;
export { HEADLESS_TASKS } from '../../../modules/attendance-scheduler';
