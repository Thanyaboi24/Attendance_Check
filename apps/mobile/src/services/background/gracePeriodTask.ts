import { getDeps } from '../../app/container';
import { evaluateAutoAttendance } from '../../domain/useCases/evaluateAutoAttendance';
import { syncOutbox } from '../../domain/useCases/syncOutbox';
import { logger } from '../../utils/logger';
import { setupNotifications } from '../notifications';

export interface GracePeriodTaskData {
  requestId?: string;
}

/**
 * Headless JS task started by the native WorkManager worker when the grace period of `requestId` is over
 * (design §7.6). Runs the same `evaluateAutoAttendance` use case as the rest of the app.
 */
export async function gracePeriodTask(data: GracePeriodTaskData): Promise<void> {
  if (!data?.requestId) return;
  try {
    const deps = await getDeps();
    await setupNotifications().catch(() => undefined);
    await evaluateAutoAttendance(deps, data.requestId);
    await syncOutbox(deps).catch(() => undefined);
  } catch (e) {
    logger.error('GracePeriodTask failed', e);
  }
}
