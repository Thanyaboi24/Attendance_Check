import type { GeofenceConfig } from '@attendance/shared';
import * as Location from 'expo-location';
import type { GeofenceMonitor } from '../../domain/ports';
import { regionIdFor } from '../../domain/useCases/handleGeofenceTransition';

/** Task name used by `TaskManager.defineTask` in index.ts and by `startGeofencingAsync`. */
export const GEOFENCE_TASK = 'GEOFENCE_TASK';

/**
 * Geofence service (design §7.1): one circular region from the active GeofenceConfiguration, ENTER + EXIT.
 * The region identifier carries the config version (`faculty-v3`) so the task knows which version fired.
 * This service only produces location evidence; it never approves attendance itself.
 */
export const expoGeofenceMonitor: GeofenceMonitor = {
  async start(cfg: GeofenceConfig) {
    await Location.startGeofencingAsync(GEOFENCE_TASK, [
      {
        identifier: regionIdFor(cfg),
        latitude: cfg.centerLat,
        longitude: cfg.centerLng,
        radius: cfg.radiusM,
        notifyOnEnter: true,
        notifyOnExit: true,
      },
    ]);
  },
  async stop() {
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) await Location.stopGeofencingAsync(GEOFENCE_TASK);
  },
  async isRunning() {
    return Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
  },
};
