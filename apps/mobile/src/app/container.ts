import type { DeviceInfo } from '@attendance/shared';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { createHttpClients } from '../data/api/client';
import { createAttendanceApi, createAuthApi } from '../data/api/endpoints';
import { getDatabase } from '../data/db/database';
import { SqliteLocalStore } from '../data/repositories/sqliteLocalStore';
import { createSecureSessionStore } from '../data/secure/sessionStore';
import type { AppDeps } from '../domain/ports';
import { expoGeofenceMonitor } from '../services/location/geofence';
import { expoLocationProvider } from '../services/location/getFreshLocation';
import { expoPermissions } from '../services/location/permissions';
import { expoNotifier } from '../services/notifications';
import { nativeScheduler } from '../services/scheduler';
import { API_URL } from '../utils/env';
import { emitLocalDataChanged } from '../utils/events';

type AuthLostListener = () => void;
const authLostListeners = new Set<AuthLostListener>();
export function onAuthLost(l: AuthLostListener): () => void {
  authLostListeners.add(l);
  return () => {
    authLostListeners.delete(l);
  };
}

function deviceInfo(): DeviceInfo {
  return {
    model: (Device.modelName ?? 'unknown').slice(0, 120),
    os: `${Device.osName ?? 'Android'} ${Device.osVersion ?? ''}`.trim().slice(0, 60),
    appVersion: (Application.nativeApplicationVersion ?? '1.0.0').slice(0, 30),
  };
}

let depsPromise: Promise<AppDeps> | null = null;

/**
 * Composition root. One instance per JS runtime; used by the UI *and* by the headless tasks (GEOFENCE_TASK,
 * GracePeriodTask, SyncTask, BootTask), so every entry point runs the same use cases.
 */
export function getDeps(): Promise<AppDeps> {
  if (!depsPromise) {
    depsPromise = (async () => {
      const session = createSecureSessionStore();
      const { http, publicHttp } = createHttpClients({
        baseURL: API_URL,
        session,
        onAuthLost: () => authLostListeners.forEach((l) => l()),
      });
      const db = await getDatabase();
      const deps: AppDeps = {
        api: createAttendanceApi(http),
        authApi: createAuthApi(http, publicHttp),
        store: new SqliteLocalStore(db),
        session,
        location: expoLocationProvider,
        notifier: expoNotifier,
        scheduler: nativeScheduler,
        geofence: expoGeofenceMonitor,
        permissions: expoPermissions,
        clock: { now: () => new Date() },
        uuid: () => Crypto.randomUUID(),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        device: deviceInfo,
        onLocalChange: emitLocalDataChanged,
      };
      return deps;
    })().catch((e: unknown) => {
      depsPromise = null;
      throw e;
    });
  }
  return depsPromise;
}
