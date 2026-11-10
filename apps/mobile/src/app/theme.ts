import { DarkTheme as NavDark, DefaultTheme as NavLight } from '@react-navigation/native';
import { adaptNavigationTheme, MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

const brand = '#2563EB';

export const lightTheme = {
  ...MD3LightTheme,
  colors: { ...MD3LightTheme.colors, primary: brand },
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: { ...MD3DarkTheme.colors, primary: '#93B4FF' },
};

const adapted = adaptNavigationTheme({ reactNavigationLight: NavLight, reactNavigationDark: NavDark });
export const navLight = { ...adapted.LightTheme, fonts: NavLight.fonts };
export const navDark = { ...adapted.DarkTheme, fonts: NavDark.fonts };

/** Semantic colours for the five statuses and the location classes (map + badges). */
export const statusColors = {
  RECORDED: '#16A34A',
  PENDING: '#2563EB',
  UNCERTAIN_LOCATION: '#EA580C',
  FAILED: '#DC2626',
  UNSYNCHRONIZED: '#7C3AED',
  CANCELLED: '#6B7280',
} as const;

/** Neutrals and accents from the UI mockups (Faculty Attendance UI Mockups.pdf). */
export const palette = {
  background: '#F5F7FA',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  text: '#0F172A',
  textMuted: '#64748B',
  textSoft: '#475569',
  blue: '#2563EB',
  blueSoft: '#EFF6FF',
  greenSoft: '#DCFCE7',
  greenText: '#166534',
  amberBorder: '#FCD34D',
  amberRing: '#D97706',
  amberTrack: '#FDE68A',
  amberText: '#92400E',
  amberSoft: '#FFEDD5',
  graySoft: '#F1F5F9',
  barInside: '#BFDBFE',
  barOutside: '#E2E8F0',
  marker: '#1E3A8A',
} as const;

export const locationColors = {
  CONFIRMED_INSIDE: '#16A34A',
  CONFIRMED_OUTSIDE: '#6B7280',
  UNCERTAIN: '#EA580C',
} as const;
