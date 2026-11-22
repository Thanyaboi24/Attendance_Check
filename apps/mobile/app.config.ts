import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Expo config (design §12.1). Development build only (no Expo Go): background location + custom native module.
 *
 * Env:
 *   EXPO_PUBLIC_API_URL       API base URL (default: Android emulator → host `http://10.0.2.2:3000/api/v1`)
 *   GOOGLE_MAPS_ANDROID_KEY   Maps SDK for Android key (restricted to th.ac.siit.attendance + SHA-1); optional
 *   APP_VARIANT               `development` (default) | `preview` (installable test APK on a local http API) |
 *                             `production` (https only)
 *
 * Cleartext HTTP is allowed ONLY for non-production variants whose API URL is http:// (local backend on the
 * emulator). Production builds keep Android's default (HTTPS only, design §12.3).
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = process.env.APP_VARIANT ?? 'development';
  const isProduction = variant === 'production';
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000/api/v1';
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_KEY;
  const allowCleartext = !isProduction && apiUrl.startsWith('http://');

  if (isProduction && apiUrl.startsWith('http://')) {
    throw new Error('Production builds must use an https:// EXPO_PUBLIC_API_URL');
  }

  return {
    ...config,
    name: variant === 'development' ? 'Faculty Attendance (dev)' : 'Faculty Attendance',
    slug: 'faculty-attendance',
    scheme: 'facultyattendance',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    // Launcher icon from assets/brand/app-logo.jpg (regenerate with `node scripts/make-icons.js`).
    icon: './assets/icon.png',
    android: {
      package: 'th.ac.siit.attendance',
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#292F63' },
      versionCode: 1,
      permissions: [
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'POST_NOTIFICATIONS',
        'FOREGROUND_SERVICE',
        'FOREGROUND_SERVICE_LOCATION',
        'RECEIVE_BOOT_COMPLETED',
        'WAKE_LOCK',
      ],
      // Added by default by some Expo modules; this app never reads shared storage (exports go through the share sheet).
      blockedPermissions: ['android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE'],
      ...(mapsKey ? { config: { googleMaps: { apiKey: mapsKey } } } : {}),
    },
    plugins: [
      [
        'expo-location',
        {
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
          locationAlwaysAndWhenInUsePermission:
            'Faculty Attendance uses your location in the background only to detect entering or leaving the faculty attendance area.',
        },
      ],
      ['expo-notifications', { color: '#702C8B' }],
      'expo-secure-store',
      'expo-sqlite',
      ...(mapsKey ? [['react-native-maps', { androidGoogleMapsApiKey: mapsKey }] as [string, unknown]] : []),
      [
        'expo-build-properties',
        {
          android: {
            minSdkVersion: 26,
            usesCleartextTraffic: allowCleartext,
            // Release builds are shrunk by R8, which removed the no-arg constructor of WorkManager's Room database
            // (created by reflection), so the release APK crashed on start:
            // "NoSuchMethodException: androidx.work.impl.WorkDatabase_Impl.<init> []".
            extraProguardRules: [
              '-keep class * extends androidx.room.RoomDatabase { <init>(); }',
              '-keep class androidx.work.impl.WorkDatabase_Impl { *; }',
            ].join('\n'),
          },
        },
      ],
      './modules/attendance-scheduler/app.plugin.js',
    ],
    extra: {
      apiUrl,
      googleMapsConfigured: Boolean(mapsKey),
      appVariant: variant,
    },
  };
};
