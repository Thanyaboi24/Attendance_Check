import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';
import type { PermissionSnapshot, PermissionsPort } from '../../domain/ports';

export async function checkPermissions(): Promise<PermissionSnapshot> {
  const [notif, fg, bg, services] = await Promise.all([
    Notifications.getPermissionsAsync(),
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Location.hasServicesEnabledAsync(),
  ]);
  return {
    notifications: notif.granted,
    foregroundLocation: fg.granted,
    // Android reports 'fine' (precise) or 'coarse' (approximate).
    preciseLocation: fg.granted && (fg.android?.accuracy ?? 'fine') === 'fine',
    backgroundLocation: bg.granted,
    locationServices: services,
  };
}

export const expoPermissions: PermissionsPort = { check: checkPermissions };

/** Step 1: notifications (Android 13+ POST_NOTIFICATIONS). */
export async function requestNotificationPermission(): Promise<boolean> {
  const r = await Notifications.requestPermissionsAsync();
  return r.granted;
}

/** Step 2: foreground precise location. */
export async function requestForegroundLocation(): Promise<{ granted: boolean; precise: boolean; canAskAgain: boolean }> {
  const r = await Location.requestForegroundPermissionsAsync();
  return { granted: r.granted, precise: r.granted && (r.android?.accuracy ?? 'fine') === 'fine', canAskAgain: r.canAskAgain };
}

/** Step 3: background location ("Allow all the time"); Android 11+ sends the user to Settings. */
export async function requestBackgroundLocation(): Promise<boolean> {
  const r = await Location.requestBackgroundPermissionsAsync();
  return r.granted;
}

export function openAppSettings(): Promise<void> {
  return Linking.openSettings();
}

/** Step 4: battery optimisation. There is no Expo API to query it, so the screen links to the settings. */
export async function openBatteryOptimisationSettings(): Promise<void> {
  try {
    await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
  } catch {
    await Linking.openSettings();
  }
}
