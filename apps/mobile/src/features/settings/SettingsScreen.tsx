import { zonesOf } from '@attendance/shared';
import { useNavigation } from '@react-navigation/native';
import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, Card, Dialog, List, Portal, RadioButton, Text } from 'react-native-paper';
import { getDeps } from '../../app/container';
import { syncNow } from '../../app/controller';
import type { EvidenceRecord } from '../../domain/models';
import { type LogoutOutcome, logout } from '../../domain/useCases/auth';
import { isLanguage, LANGUAGE_NAME, LANGUAGES, setLanguage } from '../../i18n';
import { isSchedulerAvailable } from '../../services/scheduler';
import { useAppStore } from '../../store/appStore';
import { API_URL, APP_VARIANT, GOOGLE_MAPS_CONFIGURED } from '../../utils/env';
import { fmtDateTime } from '../../ui/components';
import { evaluationJson, eventsCsv, requestsCsv } from './evaluationExport';

async function share(name: string, content: string, mimeType: string) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}

async function collect() {
  const deps = await getDeps();
  const requests = await deps.store.listRequests(10_000);
  const evidence = new Map<string, EvidenceRecord[]>();
  for (const r of requests) evidence.set(r.requestId, await deps.store.listEvidence(r.requestId));
  const events = await deps.store.listEvents(20_000);
  return { deps, requests, evidence, events, device: deps.device() };
}

export function SettingsScreen() {
  const navigation = useNavigation();
  const user = useAppStore((s) => s.user);
  const model = useAppStore((s) => s.dashboard);
  const monitoring = useAppStore((s) => s.monitoring);
  const [warning, setWarning] = useState<Extract<LogoutOutcome, { kind: 'NEEDS_CONFIRMATION' }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { t, i18n } = useTranslation('settings');
  const language = isLanguage(i18n.language) ? i18n.language : 'en';

  async function doLogout(confirmed: boolean) {
    setBusy(true);
    try {
      const deps = await getDeps();
      const out = await logout(deps, { confirmed });
      if (out.kind === 'NEEDS_CONFIRMATION') setWarning(out);
      else {
        setWarning(null);
        useAppStore.getState().setSignedOut();
      }
    } finally {
      setBusy(false);
    }
  }

  async function exportAs(kind: 'requests-csv' | 'events-csv' | 'json') {
    setExportError(null);
    try {
      const { requests, evidence, events, device } = await collect();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      if (kind === 'requests-csv') await share(`attendance-requests-${stamp}.csv`, requestsCsv(requests, evidence, device), 'text/csv');
      else if (kind === 'events-csv') await share(`attendance-events-${stamp}.csv`, eventsCsv(events), 'text/csv');
      else
        await share(
          `attendance-evaluation-${stamp}.json`,
          evaluationJson({ exportedAt: new Date().toISOString(), device, requests, evidence, events }),
          'application/json',
        );
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    }
  }

  const config = model?.config;
  const area = config
    ? t('about.areaSummary', { name: config.name, version: String(config.version), grace: String(config.gracePeriodSec) }) +
      zonesOf(config)
        .map((z) => `\n${t('about.zone', { name: z.name, radius: String(z.radiusM) })}`)
        .join('')
    : t('about.notLoaded');

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card mode="outlined">
        <Card.Title title={user?.fullName ?? t('account.signedIn')} subtitle={`${user?.email ?? ''} · ${user?.staffId ?? ''}`} />
        <Card.Content>
          <Text variant="bodySmall">{user?.department}</Text>
        </Card.Content>
      </Card>

      <Card mode="outlined">
        <Card.Title title={t('language.title')} titleNumberOfLines={2} left={(p) => <List.Icon {...p} icon="translate" />} />
        <RadioButton.Group value={language} onValueChange={(v) => isLanguage(v) && void setLanguage(v)}>
          {LANGUAGES.map((lang) => (
            <RadioButton.Item
              key={lang}
              value={lang}
              label={LANGUAGE_NAME[lang]}
              accessibilityLabel={`${t('language.a11y')}: ${LANGUAGE_NAME[lang]}`}
            />
          ))}
        </RadioButton.Group>
      </Card>

      <Card mode="outlined">
        <List.Item
          title={t('permissions.title')}
          titleNumberOfLines={2}
          description={monitoring?.active ? t('permissions.active') : t('permissions.limited')}
          descriptionNumberOfLines={3}
          left={(p) => <List.Icon {...p} icon="shield-check" />}
          onPress={() => navigation.navigate('Permissions')}
        />
        <List.Item
          title={t('sync.title')}
          titleNumberOfLines={2}
          description={t('sync.summary', { pending: String(model?.outboxCount ?? 0), failed: String(model?.failedOutboxCount ?? 0) })}
          descriptionNumberOfLines={2}
          left={(p) => <List.Icon {...p} icon="cloud-sync" />}
          onPress={() => void syncNow()}
        />
      </Card>

      <Card mode="outlined">
        <Card.Title title={t('evaluation.title')} subtitle={t('evaluation.subtitle')} titleNumberOfLines={2} subtitleNumberOfLines={3} />
        <Card.Actions style={{ flexWrap: 'wrap' }}>
          <Button onPress={() => void exportAs('requests-csv')}>{t('evaluation.requestsCsv')}</Button>
          <Button onPress={() => void exportAs('events-csv')}>{t('evaluation.eventsCsv')}</Button>
          <Button onPress={() => void exportAs('json')}>{t('evaluation.json')}</Button>
        </Card.Actions>
        {exportError ? (
          <Card.Content>
            <Text style={{ color: '#DC2626' }}>{exportError}</Text>
          </Card.Content>
        ) : null}
      </Card>

      <Card mode="outlined">
        <Card.Title title={t('about.title')} />
        <Card.Content style={{ gap: 2 }}>
          <Text variant="bodySmall">
            {t('about.version', {
              version: Application.nativeApplicationVersion ?? '1.0.0',
              build: Application.nativeBuildVersion ?? 'dev',
              variant: APP_VARIANT,
            })}
          </Text>
          <Text variant="bodySmall">{t('about.api', { url: API_URL })}</Text>
          <Text variant="bodySmall">{t('about.area', { text: area })}</Text>
          <Text variant="bodySmall">{t('about.lastSync', { time: fmtDateTime(model?.snapshotFetchedAt) })}</Text>
          <Text variant="bodySmall">
            {t('about.scheduler', { value: isSchedulerAvailable ? t('about.schedulerAvailable') : t('about.schedulerMissing') })}
          </Text>
          <Text variant="bodySmall">{t('about.maps', { value: GOOGLE_MAPS_CONFIGURED ? t('about.mapsConfigured') : t('about.mapsMissing') })}</Text>
        </Card.Content>
      </Card>

      <Button mode="outlined" icon="logout" onPress={() => void doLogout(false)} loading={busy} disabled={busy}>
        {t('signOut.button')}
      </Button>

      <Portal>
        <Dialog visible={warning != null} onDismiss={() => setWarning(null)}>
          <Dialog.Title>{t('signOut.title')}</Dialog.Title>
          <Dialog.Content style={{ gap: 8 }}>
            <Text variant="bodyMedium">{t('signOut.stopsMonitoring')}</Text>
            {warning?.openSession ? (
              <Text variant="bodyMedium">{t('signOut.openSession', { time: fmtDateTime(warning.openSession.checkInAt) })}</Text>
            ) : null}
            {warning?.pendingRequest ? <Text variant="bodyMedium">{t('signOut.pendingRequest')}</Text> : null}
            {warning && warning.unsyncedCount > 0 ? (
              <Text variant="bodyMedium">{t('signOut.unsynced', { count: warning.unsyncedCount })}</Text>
            ) : null}
          </Dialog.Content>
          <Dialog.Actions style={{ flexWrap: 'wrap' }}>
            <Button onPress={() => setWarning(null)}>{t('signOut.stay')}</Button>
            <Button onPress={() => void doLogout(true)} loading={busy}>
              {t('signOut.confirm')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({ container: { padding: 16, gap: 12 } });
