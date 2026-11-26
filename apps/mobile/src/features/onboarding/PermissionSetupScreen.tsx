import { type RouteProp, useFocusEffect, useRoute } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
function Step({ n, title, body, ok, okLabel, missingLabel, action }: StepProps) {
  const { t } = useTranslation('onboarding');
  return (
    <View style={styles.step}>
      <View style={styles.num}>
        <Text style={[styles.numText, mono]}>{n}</Text>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.stepHead}>
          <Text style={styles.stepTitle}>{title}</Text>
          {ok == null ? null : <Pill tone={ok ? 'green' : 'amber'}>{ok ? (okLabel ?? t('permissions.allowed')) : (missingLabel ?? t('permissions.needed'))}</Pill>}
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
  const { t } = useTranslation('onboarding');

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
      useAppStore.getState().setOnboarded(true);
      // Registering the geofences downloads the attendance area first; when the server is slow or unreachable
      // that can take up to the request timeout. Do it in the background so the button responds at once.
      void refreshMonitoring(true).catch(() => undefined);
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
    if (!p.notifications) warning = t('permissions.warning.notifications');
    else if (!preciseOk) warning = t('permissions.warning.precise');
    else if (!p.backgroundLocation) warning = t('permissions.warning.background');
    else if (!p.locationServices) warning = t('permissions.warning.services');
  }

  return (
    <ScrollView style={{ backgroundColor: palette.background }} contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
      <ScreenTitle
        kicker={fromOnboarding ? t('permissions.kicker') : undefined}
        title={t('permissions.title')}
        subtitle={t('permissions.subtitle', { count: minutes })}
      />

      <Step
        n="01"
        title={t('permissions.notifications.title')}
        body={t('permissions.notifications.body')}
        ok={p ? p.notifications : null}
        action={{ label: t('permissions.allow'), onPress: () => void step(requestNotificationPermission) }}
      />
      <Step
        n="02"
        title={t('permissions.precise.title')}
        body={fgOk && !preciseOk ? t('permissions.precise.approximateBody') : t('permissions.precise.body')}
        ok={p ? preciseOk : null}
        action={
          fgOk
            ? { label: t('permissions.openSettings'), onPress: () => void openAppSettings() }
            : { label: t('permissions.allow'), onPress: () => void step(requestForegroundLocation) }
        }
      />
      <Step
        n="03"
        title={t('permissions.background.title')}
        body={t('permissions.background.body')}
        ok={p ? p.backgroundLocation : null}
        action={fgOk ? { label: t('permissions.openSettings'), onPress: () => void step(requestBackgroundLocation) } : undefined}
      />
      {p && !p.locationServices ? (
        <Step
          n="04"
          title={t('permissions.services.title')}
          body={t('permissions.services.body')}
          ok={false}
          missingLabel={t('permissions.off')}
          action={{ label: t('permissions.openSettings'), onPress: () => void openAppSettings() }}
        />
      ) : null}
      <Step
        n={p && !p.locationServices ? '05' : '04'}
        title={t('permissions.battery.title')}
        body={t('permissions.battery.body')}
        ok={false}
        missingLabel={t('permissions.recommended')}
        action={{ label: t('permissions.openSettings'), onPress: () => void openBatteryOptimisationSettings() }}
      />

      {warning ? (
        <Notice tone="amber">
          {t('permissions.notActive')
            .split(/<b>(.*?)<\/b>/)
            .map((part, i) =>
              i % 2 === 1 ? (
                <Text key={i} style={{ fontWeight: '800', color: '#9A3412' }}>
                  {part}
                </Text>
              ) : (
                part
              ),
            )}{' '}
          {warning}
        </Notice>
      ) : null}
      {!isSchedulerAvailable ? (
        <Notice tone="red">{t('permissions.noScheduler')}</Notice>
      ) : null}

      {fromOnboarding ? (
        <View style={{ gap: 12, marginTop: 8 }}>
          <BigButton onPress={() => void finish()} disabled={!allOk} busy={busy}>
            {t('permissions.start')}
          </BigButton>
          {!allOk ? (
            <Pressable onPress={() => void finish()} accessibilityRole="button" style={{ alignSelf: 'center' }} hitSlop={8}>
              <Text style={styles.skip}>{t('permissions.continueLimited')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : monitoring?.active ? (
        <Pill tone="green">{t('permissions.monitoringActive')}</Pill>
      ) : null}

      <Text style={styles.footer}>{t('permissions.footer')}</Text>
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
