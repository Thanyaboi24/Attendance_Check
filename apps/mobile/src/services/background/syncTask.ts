import { getDeps } from '../../app/container';
import { bootstrap } from '../../domain/useCases/auth';
import { syncOutbox } from '../../domain/useCases/syncOutbox';
import { logger } from '../../utils/logger';
import { setupNotifications } from '../notifications';

/** SyncTask: WorkManager one-off job with a network-connected constraint (design §7.8). */
export async function syncTask(): Promise<void> {
  try {
    const deps = await getDeps();
    const s = await syncOutbox(deps);
    // Still entries waiting with a backoff → ask WorkManager to come back.
    if (s.remaining > 0 && !s.skipped) await deps.scheduler.scheduleSync().catch(() => undefined);
  } catch (e) {
    logger.error('SyncTask failed', e);
  }
}

/** BootTask: started by the native BootReceiver after reboot / app update — re-register geofence, re-schedule jobs. */
export async function bootTask(): Promise<void> {
  try {
    const deps = await getDeps();
    await setupNotifications().catch(() => undefined);
    await bootstrap(deps, { reason: 'BOOT' });
  } catch (e) {
    logger.error('BootTask failed', e);
  }
}
