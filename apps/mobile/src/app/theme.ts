import { DarkTheme as NavDark, DefaultTheme as NavLight } from '@react-navigation/native';
import { adaptNavigationTheme, MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

/** SIIT purple (from the institute logo); crimson #B81F3B is the accent. */
const brand = '#702C8B';

export const lightTheme = {
  ...MD3LightTheme,
  colors: { ...MD3LightTheme.colors, primary: brand },
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: { ...MD3DarkTheme.colors, primary: '#C397D7' },
};

const adapted = adaptNavigationTheme({ reactNavigationLight: NavLight, reactNavigationDark: NavDark });
export const navLight = { ...adapted.LightTheme, fonts: NavLight.fonts };
export const navDark = { ...adapted.DarkTheme, fonts: NavDark.fonts };

/** Semantic colours for the five statuses and the location classes (map + badges). */
export const statusColors = {
  RECORDED: '#16A34A',
  PENDING: '#702C8B',
  UNCERTAIN_LOCATION: '#EA580C',
  FAILED: '#DC2626',
  UNSYNCHRONIZED: '#0369A1',
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
  blue: '#702C8B',
  blueSoft: '#F7F0FA',
  greenSoft: '#DCFCE7',
  greenText: '#166534',
  amberBorder: '#FCD34D',
  amberRing: '#D97706',
  amberTrack: '#FDE68A',
  amberText: '#92400E',
  amberSoft: '#FFEDD5',
  graySoft: '#F1F5F9',
  barInside: '#DCC0E8',
  barOutside: '#E2E8F0',
  marker: '#3A1649',
} as const;

export const locationColors = {
  CONFIRMED_INSIDE: '#16A34A',
  CONFIRMED_OUTSIDE: '#6B7280',
  UNCERTAIN: '#EA580C',
} as const;
