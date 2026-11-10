import type { GeofenceConfig } from '@attendance/shared';
import { errorMessage } from '../errors';
import type { AppDeps, PermissionSnapshot } from '../ports';
import { logEvent, META_REGISTERED_CONFIG_VERSION, safe } from './common';

export type MissingRequirement =
  | 'NOTIFICATIONS'
  | 'FOREGROUND_LOCATION'
  | 'PRECISE_LOCATION'
  | 'BACKGROUND_LOCATION'
  | 'LOCATION_SERVICES'
  | 'GEOFENCE_CONFIG'
  | 'GEOFENCE_REGISTRATION';

export interface MonitoringStatus {
  /** True only when every requirement holds and the geofence is registered. Never claimed otherwise. */
  active: boolean;
  /** Geofence registered with the OS (it can be registered while notifications are missing). */
  geofenceRegistered: boolean;
  missing: MissingRequirement[];
  configVersion: number | null;
  permissions: PermissionSnapshot | null;
  error?: string;
}

export function missingFrom(p: PermissionSnapshot): MissingRequirement[] {
  const m: MissingRequirement[] = [];
  if (!p.notifications) m.push('NOTIFICATIONS');
  if (!p.foregroundLocation) m.push('FOREGROUND_LOCATION');
  else if (!p.preciseLocation) m.push('PRECISE_LOCATION');
  if (!p.backgroundLocation) m.push('BACKGROUND_LOCATION');
  if (!p.locationServices) m.push('LOCATION_SERVICES');
  return m;
}

/** Background geofencing needs foreground + precise + "Allow all the time" location. */
export function canRegisterGeofence(p: PermissionSnapshot): boolean {
  return p.foregroundLocation && p.preciseLocation && p.backgroundLocation;
}

/**
 * (Re-)registers the geofence (login, config version change, app start, boot — design §7.1).
 * Registration is repeated when `force` or when the registered version differs from `cfg.version`.
 */
export async function ensureMonitoring(
  deps: AppDeps,
  cfg: GeofenceConfig | null,
  opts: { force?: boolean } = {},
): Promise<MonitoringStatus> {
  let permissions: PermissionSnapshot | null = null;
  try {
    permissions = await deps.permissions.check();
  } catch (e) {
    return { active: false, geofenceRegistered: false, missing: ['FOREGROUND_LOCATION'], configVersion: null, permissions, error: errorMessage(e) };
  }
  const missing = missingFrom(permissions);
  if (!cfg) {
    await logEvent(deps, 'MONITORING_UNAVAILABLE', null, { missing: [...missing, 'GEOFENCE_CONFIG'] });
    return { active: false, geofenceRegistered: false, missing: [...missing, 'GEOFENCE_CONFIG'], configVersion: null, permissions };
  }
  if (!canRegisterGeofence(permissions)) {
    await safe(() => deps.geofence.stop());
    await deps.store.setMeta(META_REGISTERED_CONFIG_VERSION, null);
    await logEvent(deps, 'MONITORING_UNAVAILABLE', null, { missing });
    return { active: false, geofenceRegistered: false, missing, configVersion: cfg.version, permissions };
  }

  const registered = await deps.store.getMeta(META_REGISTERED_CONFIG_VERSION);
  const running = (await safe(() => deps.geofence.isRunning())) ?? false;
  try {
    if (opts.force || !running || registered !== String(cfg.version)) {
      await deps.geofence.start(cfg);
      await deps.store.setMeta(META_REGISTERED_CONFIG_VERSION, String(cfg.version));
      await logEvent(deps, 'MONITORING_STARTED', null, { configVersion: cfg.version, radiusM: cfg.radiusM });
    }
  } catch (e) {
    await logEvent(deps, 'MONITORING_UNAVAILABLE', null, { error: errorMessage(e) });
    return {
      active: false,
      geofenceRegistered: false,
      missing: [...missing, 'GEOFENCE_REGISTRATION'],
      configVersion: cfg.version,
      permissions,
      error: errorMessage(e),
    };
  }
  return { active: missing.length === 0, geofenceRegistered: true, missing, configVersion: cfg.version, permissions };
}

export async function stopMonitoring(deps: AppDeps): Promise<void> {
  await safe(() => deps.geofence.stop());
  await deps.store.setMeta(META_REGISTERED_CONFIG_VERSION, null);
  await logEvent(deps, 'MONITORING_STOPPED', null, {});
}
