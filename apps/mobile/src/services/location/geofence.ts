import { type GeofenceConfig, zonesOf } from '@attendance/shared';
import * as Location from 'expo-location';
import type { GeofenceMonitor } from '../../domain/ports';
import { regionIdFor } from '../../domain/useCases/handleGeofenceTransition';

/** Task name used by `TaskManager.defineTask` in index.ts and by `startGeofencingAsync`. */
export const GEOFENCE_TASK = 'GEOFENCE_TASK';

/**
 * Geofence service (design §7.1): one circular region per area (campus) of the active GeofenceConfiguration,
 * ENTER + EXIT. Region identifiers carry the config version (`faculty-v3`, `faculty-v3-z2`) so the task knows
 * which version fired. Areas are far apart, so leaving one area means leaving all of them; the use case
 * re-checks with a fresh fix against every area before anything is recorded.
 * This service only produces location evidence; it never approves attendance itself.
 */
export const expoGeofenceMonitor: GeofenceMonitor = {
  async start(cfg: GeofenceConfig) {
    await Location.startGeofencingAsync(
      GEOFENCE_TASK,
      zonesOf(cfg).map((z, i) => ({
        identifier: regionIdFor(cfg, i),
        latitude: z.centerLat,
        longitude: z.centerLng,
        radius: z.radiusM,
        notifyOnEnter: true,
        notifyOnExit: true,
      })),
    );
  },
  async stop() {
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) await Location.stopGeofencingAsync(GEOFENCE_TASK);
  },
  async isRunning() {
    return Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
  },
};
