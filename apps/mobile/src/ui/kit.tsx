import React from 'react';
import { Pressable, StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { palette } from '../app/theme';

/** Building blocks shared by the screens styled after "Faculty Attendance UI Mockups.pdf". */

export function Panel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export type PillTone = 'green' | 'amber' | 'gray' | 'purple' | 'red' | 'blue';

const PILL: Record<PillTone, { bg: string; fg: string }> = {
  green: { bg: palette.greenSoft, fg: palette.greenText },
  amber: { bg: palette.amberSoft, fg: palette.amberText },
  gray: { bg: palette.graySoft, fg: palette.textSoft },
  purple: { bg: '#EDE9FE', fg: '#6D28D9' },
  red: { bg: '#FEE2E2', fg: '#B91C1C' },
  blue: { bg: palette.blueSoft, fg: palette.blue },
};

export function Pill({ tone, children }: { tone: PillTone; children: string }) {
  const c = PILL[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[styles.pillText, { color: c.fg }]}>{children}</Text>
    </View>
  );
}

/** Large rounded action button (Log in, Submit request, Start monitoring). */
export function BigButton({
  children,
  onPress,
  disabled,
  busy,
  variant = 'primary',
}: {
  children: string;
  onPress(): void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'outline';
}) {
  const off = disabled || busy;
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={({ pressed }) => [
        styles.big,
        primary ? { backgroundColor: off && !busy ? '#CBD5E1' : palette.blue } : styles.bigOutline,
        pressed && !off ? { opacity: 0.85 } : null,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? '#FFFFFF' : palette.blue} />
      ) : (
        <Text style={[styles.bigText, { color: primary ? (off ? palette.textSoft : '#FFFFFF') : off ? palette.textMuted : palette.text }]}>{children}</Text>
      )}
    </Pressable>
  );
}

export function ScreenTitle({ kicker, title, subtitle }: { kicker?: string; title: string; subtitle?: string }) {
  return (
    <View style={{ gap: 8 }}>
      {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Notice({ tone, children }: { tone: 'amber' | 'red'; children: React.ReactNode }) {
  const c = tone === 'amber' ? { bg: '#FFF7ED', border: '#FED7AA', fg: '#9A3412' } : { bg: '#FEF2F2', border: '#FECACA', fg: '#991B1B' };
  return (
    <View style={[styles.notice, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={{ color: c.fg, fontSize: 15, lineHeight: 22 }}>{children}</Text>
    </View>
  );
}

export const mono = { fontFamily: 'monospace' } as const;

const styles = StyleSheet.create({
  panel: { backgroundColor: palette.surface, borderRadius: 20, borderWidth: 1, borderColor: palette.border, padding: 20 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 14, fontWeight: '700' },
  big: { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  bigOutline: { backgroundColor: palette.surface, borderWidth: 1, borderColor: '#CBD5E1' },
  bigText: { fontSize: 18, fontWeight: '700' },
  kicker: { fontSize: 15, fontWeight: '700', color: palette.blue },
  title: { fontSize: 28, fontWeight: '800', color: palette.text },
  subtitle: { fontSize: 16, lineHeight: 24, color: palette.textSoft },
  notice: { borderWidth: 1, borderRadius: 16, padding: 16 },
});
