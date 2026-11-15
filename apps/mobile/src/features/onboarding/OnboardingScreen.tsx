import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette } from '../../app/theme';
import { BigButton, ScreenTitle } from '../../ui/kit';

type PointKey = 'monitoring' | 'confirm' | 'automatic' | 'dismiss' | 'privacy' | 'signOut';

const POINTS: Array<{ key: PointKey; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }> = [
  { key: 'monitoring', icon: 'map-marker-radius-outline' },
  { key: 'confirm', icon: 'bell-ring-outline' },
  { key: 'automatic', icon: 'timer-sand' },
  { key: 'dismiss', icon: 'bell-cancel-outline' },
  { key: 'privacy', icon: 'shield-lock-outline' },
  { key: 'signOut', icon: 'logout' },
];

/** Step 1 of 2: how attendance works, before the permission screen (mockup page 2 is step 2). */
export function OnboardingScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('onboarding');
  return (
    <ScrollView style={{ backgroundColor: palette.background }} contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
      <ScreenTitle kicker={t('intro.kicker')} title={t('intro.title')} />
      {POINTS.map((p) => (
        <View key={p.key} style={styles.card}>
          <View style={styles.icon}>
            <MaterialCommunityIcons name={p.icon} size={26} color={palette.blue} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.title}>{t(`intro.points.${p.key}.title`)}</Text>
            <Text style={styles.body}>{t(`intro.points.${p.key}.body`)}</Text>
          </View>
        </View>
      ))}
      <BigButton onPress={() => navigation.navigate('Permissions', { fromOnboarding: true })}>{t('intro.continue')}</BigButton>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14 },
  card: { flexDirection: 'row', gap: 16, backgroundColor: palette.surface, borderRadius: 20, borderWidth: 1, borderColor: palette.border, padding: 18 },
  icon: { width: 52, height: 52, borderRadius: 14, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: palette.text },
  body: { fontSize: 15, lineHeight: 22, color: palette.textSoft },
});
