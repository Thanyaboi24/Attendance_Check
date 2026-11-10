import { type RouteProp, useFocusEffect, useRoute } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDeps } from '../../app/container';
import { refreshMonitoring } from '../../app/controller';
import type { RootStackParamList } from '../../app/navigation/types';
import { palette } from '../../app/theme';
import type { PermissionSnapshot } from '../../domain/ports';
import { META_ONBOARDED } from '../../domain/useCases/common';
import {
  checkPermissions,
  openAppSettings,
  openBatteryOptimisationSettings,
  requestBackgroundLocation,
  requestForegroundLocation,
  requestNotificationPermission,
} from '../../services/location/permissions';
import { isSchedulerAvailable } from '../../services/scheduler';
import { useAppStore } from '../../store/appStore';
import { BigButton, mono, Notice, Pill, ScreenTitle } from '../../ui/kit';

interface StepProps {
  n: string;
  title: string;
  body: string;
  /** null while the permission state is still loading. */
  ok: boolean | null;
  okLabel?: string;
  missingLabel?: string;
  action?: { label: string; onPress: () => void };
}

/** Numbered permission card (mockup page 2). */
function Step({ n, title, body, ok, okLabel = 'Allowed', missingLabel = 'Needed', action }: StepProps) {
  return (
    <View style={styles.step}>
      <View style={styles.num}>
        <Text style={[styles.numText, mono]}>{n}</Text>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.stepHead}>
          <Text style={styles.stepTitle}>{title}</Text>
          {ok == null ? null : <Pill tone={ok ? 'green' : 'amber'}>{ok ? okLabel : missingLabel}</Pill>}
        </View>
        <Text style={styles.stepBody}>{body}</Text>
        {!ok && action ? (
          <Pressable style={styles.stepButton} onPress={action.onPress} accessibilityRole="button">
            <Text style={styles.stepButtonText}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Permission setup in the required order (mockup page 2, design §9.4): notifications → precise location →
 * background "Allow all the time", then location services and the battery hint. Shows what is still missing.
 */
export function PermissionSetupScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Permissions'>>();
  const insets = useSafeAreaInsets();
  const fromOnboarding = route.params?.fromOnboarding === true;
  const monitoring = useAppStore((s) => s.monitoring);
  const graceSec = useAppStore((s) => s.dashboard?.config?.gracePeriodSec ?? 300);
  const [p, setP] = useState<PermissionSnapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setP(await checkPermissions());
    await refreshMonitoring(false).catch(() => undefined);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
      // Coming back from Android Settings.
      const sub = AppState.addEventListener('change', (s) => s === 'active' && void reload());
      return () => sub.remove();
    }, [reload]),
  );

  async function step(fn: () => Promise<unknown>) {
    await fn().catch(() => undefined);
    await reload();
  }

  async function finish() {
    setBusy(true);
    try {
      const deps = await getDeps();
      await deps.store.setMeta(META_ONBOARDED, '1');
      await refreshMonitoring(true).catch(() => undefined);
      useAppStore.getState().setOnboarded(true);
    } finally {
      setBusy(false);
    }
  }

  const fgOk = p?.foregroundLocation ?? false;
  const preciseOk = fgOk && (p?.preciseLocation ?? false);
  const allOk = p != null && p.notifications && preciseOk && p.backgroundLocation && p.locationServices;
  const minutes = Math.max(1, Math.round(graceSec / 60));

  let warning: string | null = null;
  if (p && !allOk) {
    if (!p.notifications) warning = 'Notifications must be allowed.';
    else if (!preciseOk) warning = 'Precise location must be allowed.';
    else if (!p.backgroundLocation) warning = 'Background location must be set to “Allow all the time”.';
    else if (!p.locationServices) warning = 'Location must be turned on for this phone.';
  }

  return (
    <ScrollView style={{ backgroundColor: palette.background }} contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
      <ScreenTitle
        kicker={fromOnboarding ? 'Step 2 of 2' : undefined}
        title="Turn on attendance monitoring"
        subtitle={`The app asks you to check in when you enter the faculty area and to check out when you leave. If you don't respond within ${minutes} minutes, it checks your location again before recording automatically.`}
      />

      <Step
        n="01"
        title="Notifications"
        body="Shows check-in and check-out requests."
        ok={p ? p.notifications : null}
        action={{ label: 'Allow', onPress: () => void step(requestNotificationPermission) }}
      />
      <Step
        n="02"
        title="Precise location"
        body={fgOk && !preciseOk ? 'Only approximate location is allowed, so every reading would be “Uncertain”. Choose “Precise” in Settings.' : 'Needed to tell whether you are inside the attendance area.'}
        ok={p ? preciseOk : null}
        action={fgOk ? { label: 'Open settings', onPress: () => void openAppSettings() } : { label: 'Allow', onPress: () => void step(requestForegroundLocation) }}
      />
      <Step
        n="03"
        title="Background location"
        body="Detects entry and exit while the app is closed. Choose “Allow all the time”."
        ok={p ? p.backgroundLocation : null}
        action={fgOk ? { label: 'Open settings', onPress: () => void step(requestBackgroundLocation) } : undefined}
      />
      {p && !p.locationServices ? (
        <Step n="04" title="Location services" body="Location is turned off on this phone." ok={false} missingLabel="Off" action={{ label: 'Open settings', onPress: () => void openAppSettings() }} />
      ) : null}
      <Step
        n={p && !p.locationServices ? '05' : '04'}
        title="Battery optimisation"
        body="Some phones (Xiaomi, Oppo, Samsung…) stop background work. Set this app to “Unrestricted” so detection and the automatic check run on time."
        ok={false}
        missingLabel="Recommended"
        action={{ label: 'Open settings', onPress: () => void openBatteryOptimisationSettings() }}
      />

      {warning ? (
        <Notice tone="amber">
          Monitoring is <Text style={{ fontWeight: '800', color: '#9A3412' }}>not active</Text> yet. {warning}
        </Notice>
      ) : null}
      {!isSchedulerAvailable ? (
        <Notice tone="red">The background scheduler is not part of this build, so automatic attendance after the grace period is unavailable.</Notice>
      ) : null}

      {fromOnboarding ? (
        <View style={{ gap: 12, marginTop: 8 }}>
          <BigButton onPress={() => void finish()} disabled={!allOk} busy={busy}>
            Start monitoring
          </BigButton>
          {!allOk ? (
            <Pressable onPress={() => void finish()} accessibilityRole="button" style={{ alignSelf: 'center' }} hitSlop={8}>
              <Text style={styles.skip}>Continue with limited monitoring</Text>
            </Pressable>
          ) : null}
        </View>
      ) : monitoring?.active ? (
        <Pill tone="green">Monitoring active</Pill>
      ) : null}

      <Text style={styles.footer}>Your location is checked only for attendance. No travel history is stored.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14 },
  step: { flexDirection: 'row', gap: 16, backgroundColor: palette.surface, borderRadius: 20, borderWidth: 1, borderColor: palette.border, padding: 18 },
  num: { width: 52, height: 52, borderRadius: 14, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 18, color: palette.blue },
  stepHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  stepTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: palette.text },
  stepBody: { fontSize: 15, lineHeight: 22, color: palette.textSoft },
  stepButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: palette.blue, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, marginTop: 6 },
  stepButtonText: { color: palette.blue, fontSize: 16, fontWeight: '700' },
  skip: { color: palette.textSoft, fontSize: 15, textDecorationLine: 'underline' },
  footer: { textAlign: 'center', color: palette.textMuted, fontSize: 14, lineHeight: 20 },
});
