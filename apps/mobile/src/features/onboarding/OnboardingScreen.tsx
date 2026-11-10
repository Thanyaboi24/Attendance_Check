import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette } from '../../app/theme';
import { BigButton, ScreenTitle } from '../../ui/kit';

const POINTS: Array<{ icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; title: string; body: string }> = [
  {
    icon: 'map-marker-radius-outline',
    title: 'Location monitoring',
    body:
      'While you are signed in, Android watches one circle around the faculty building (geofence). Entering or leaving ' +
      'it does not record attendance by itself — it only starts a check-in or check-out request.',
  },
  {
    icon: 'bell-ring-outline',
    title: 'You confirm first',
    body:
      'You get a notification with Check in / Check out. Tapping it opens the app, takes a fresh, precise location ' +
      'reading and sends it to the server. Attendance is only "Recorded" after the server approves it.',
  },
  {
    icon: 'timer-sand',
    title: 'Automatic attendance',
    body:
      'If you do not respond within the grace period (normally 5 minutes), the app takes a NEW location reading. ' +
      'Only a reading that clearly confirms you are still inside (check-in) or still outside (check-out) is recorded ' +
      'automatically. Uncertain readings are never recorded automatically.',
  },
  {
    icon: 'bell-cancel-outline',
    title: 'What "Dismiss" means',
    body:
      'Dismiss only hides the notification. It does NOT cancel the request: automatic attendance can still happen ' +
      'after the grace period if your location is confirmed.',
  },
  {
    icon: 'shield-lock-outline',
    title: 'Privacy',
    body:
      'Only the location readings used for a check-in/check-out decision are sent to the server. There is no ' +
      'continuous tracking or travel history. The map view stays on your phone.',
  },
  {
    icon: 'logout',
    title: 'Signing out',
    body: 'Signing out stops monitoring. An open session stays open — you will not be checked out automatically.',
  },
];

/** Step 1 of 2: how attendance works, before the permission screen (mockup page 2 is step 2). */
export function OnboardingScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ backgroundColor: palette.background }} contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
      <ScreenTitle kicker="Step 1 of 2" title="How attendance works" />
      {POINTS.map((p) => (
        <View key={p.title} style={styles.card}>
          <View style={styles.icon}>
            <MaterialCommunityIcons name={p.icon} size={26} color={palette.blue} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.title}>{p.title}</Text>
            <Text style={styles.body}>{p.body}</Text>
          </View>
        </View>
      ))}
      <BigButton onPress={() => navigation.navigate('Permissions', { fromOnboarding: true })}>Continue</BigButton>
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
