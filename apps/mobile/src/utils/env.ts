import Constants from 'expo-constants';

/** Build-time configuration (app.config.ts → `extra`, and EXPO_PUBLIC_* inlined by Metro). */
interface Extra {
  apiUrl?: string;
  googleMapsConfigured?: boolean;
  appVariant?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? 'http://10.0.2.2:3000/api/v1';

/** False when no GOOGLE_MAPS_ANDROID_KEY was provided at build time: the map screen shows a text fallback. */
export const GOOGLE_MAPS_CONFIGURED: boolean = extra.googleMapsConfigured === true;

export const APP_VARIANT: string = extra.appVariant ?? 'development';
