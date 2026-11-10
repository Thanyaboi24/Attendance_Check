import { GeofenceTransition } from '@attendance/shared';
import * as Location from 'expo-location';
import type { TaskManagerTaskBody } from 'expo-task-manager';
import { getDeps } from '../../app/container';
import { handleGeofenceTransition } from '../../domain/useCases/handleGeofenceTransition';
import { logEvent } from '../../domain/useCases/common';
import { syncOutbox } from '../../domain/useCases/syncOutbox';
import { logger } from '../../utils/logger';
import { setupNotifications } from '../notifications';

interface GeofenceTaskData {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
}

/**
 * GEOFENCE_TASK executor (design §7.2). Registered at the top level of index.ts so it runs headless
 * (app in background, screen locked or process killed). Never touches the React tree.
 */
export async function geofenceTaskExecutor({ data, error }: TaskManagerTaskBody<GeofenceTaskData>): Promise<void> {
  const detectedAt = new Date().toISOString();
  try {
    const deps = await getDeps();
    if (error) {
      await logEvent(deps, 'GEOFENCE_ERROR', null, { message: error.message, code: error.code });
      return;
    }
    if (!data?.region) return;
    await setupNotifications().catch(() => undefined);
    await handleGeofenceTransition(deps, {
      transition: data.eventType === Location.GeofencingEventType.Enter ? GeofenceTransition.ENTER : GeofenceTransition.EXIT,
      regionId: data.region.identifier ?? null,
      detectedAt,
    });
    await syncOutbox(deps).catch(() => undefined);
  } catch (e) {
    logger.error('GEOFENCE_TASK failed', e);
  }
}
