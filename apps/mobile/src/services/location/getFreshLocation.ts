import { LOCATION_POLICY, type LocationReading } from '@attendance/shared';
import * as Location from 'expo-location';
import { LocationUnavailableError } from '../../domain/errors';
import type { LocationProvider } from '../../domain/ports';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LocationUnavailableError('TIMEOUT', `No location fix within ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export function toReading(loc: Location.LocationObject): LocationReading {
  return {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracyM: loc.coords.accuracy ?? null,
    measuredAt: new Date(loc.timestamp).toISOString(),
    isMock: loc.mocked ?? false, // Android only; sent as evidence.isMock
  };
}

/**
 * One-shot fresh fix (design §7.3, §16.3): `getCurrentPositionAsync({ accuracy: Highest })` wrapped in a ~20 s
 * Promise.race timeout so a headless task never hangs. Never uses getLastKnownPositionAsync as evidence.
 */
export async function getFreshLocation(): Promise<LocationReading> {
  const fg = await Location.getForegroundPermissionsAsync();
  if (!fg.granted) throw new LocationUnavailableError('PERMISSION_DENIED', 'Location permission is not granted');
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new LocationUnavailableError('SERVICES_DISABLED', 'Location services are turned off');
  }
  try {
    const loc = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest, mayShowUserSettingsDialog: true }),
      LOCATION_POLICY.freshFixTimeoutMs,
    );
    return toReading(loc);
  } catch (e) {
    if (e instanceof LocationUnavailableError) throw e;
    throw new LocationUnavailableError('ERROR', e instanceof Error ? e.message : String(e));
  }
}

export const expoLocationProvider: LocationProvider = { getFreshLocation };
