import { useNavigation } from '@react-navigation/native';
import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, Card, Dialog, List, Portal, Text } from 'react-native-paper';
import { getDeps } from '../../app/container';
import { syncNow } from '../../app/controller';
import type { EvidenceRecord } from '../../domain/models';
import { type LogoutOutcome, logout } from '../../domain/useCases/auth';
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card mode="outlined">
        <Card.Title title={user?.fullName ?? 'Signed in'} subtitle={`${user?.email ?? ''} · ${user?.staffId ?? ''}`} />
        <Card.Content>
          <Text variant="bodySmall">{user?.department}</Text>
        </Card.Content>
      </Card>

      <Card mode="outlined">
        <List.Item
          title="Permissions & monitoring"
          description={monitoring?.active ? 'Monitoring active' : 'Monitoring limited — tap to review'}
          left={(p) => <List.Icon {...p} icon="shield-check" />}
          onPress={() => navigation.navigate('Permissions')}
        />
        <List.Item
          title="Synchronise now"
          description={`${model?.outboxCount ?? 0} pending · ${model?.failedOutboxCount ?? 0} failed`}
          left={(p) => <List.Icon {...p} icon="cloud-sync" />}
          onPress={() => void syncNow()}
        />
      </Card>

      <Card mode="outlined">
        <Card.Title title="Evaluation log" subtitle="Timestamps of every detection, notification, fix and decision" />
        <Card.Actions style={{ flexWrap: 'wrap' }}>
          <Button onPress={() => void exportAs('requests-csv')}>Requests CSV</Button>
          <Button onPress={() => void exportAs('events-csv')}>Events CSV</Button>
          <Button onPress={() => void exportAs('json')}>JSON</Button>
        </Card.Actions>
        {exportError ? (
          <Card.Content>
            <Text style={{ color: '#DC2626' }}>{exportError}</Text>
          </Card.Content>
        ) : null}
      </Card>

      <Card mode="outlined">
        <Card.Title title="About" />
        <Card.Content style={{ gap: 2 }}>
          <Text variant="bodySmall">
            Version {Application.nativeApplicationVersion ?? '1.0.0'} ({Application.nativeBuildVersion ?? 'dev'}) · {APP_VARIANT}
          </Text>
          <Text variant="bodySmall">API: {API_URL}</Text>
          <Text variant="bodySmall">
            Area: {model?.config ? `${model.config.name} v${model.config.version}, radius ${model.config.radiusM} m, grace ${model.config.gracePeriodSec} s` : 'not loaded'}
          </Text>
          <Text variant="bodySmall">Last server sync: {fmtDateTime(model?.snapshotFetchedAt)}</Text>
          <Text variant="bodySmall">Background scheduler: {isSchedulerAvailable ? 'available' : 'NOT available in this build'}</Text>
          <Text variant="bodySmall">Google Maps: {GOOGLE_MAPS_CONFIGURED ? 'configured' : 'not configured (text fallback)'}</Text>
        </Card.Content>
      </Card>

      <Button mode="outlined" icon="logout" onPress={() => void doLogout(false)} loading={busy} disabled={busy}>
        Sign out
      </Button>

      <Portal>
        <Dialog visible={warning != null} onDismiss={() => setWarning(null)}>
          <Dialog.Title>Sign out?</Dialog.Title>
          <Dialog.Content style={{ gap: 8 }}>
            <Text variant="bodyMedium">Signing out stops location monitoring on this phone.</Text>
            {warning?.openSession ? (
              <Text variant="bodyMedium">
                You are checked in since {fmtDateTime(warning.openSession.checkInAt)}. Your session stays open and you will NOT be checked out
                automatically.
              </Text>
            ) : null}
            {warning?.pendingRequest ? <Text variant="bodyMedium">A pending check-in/check-out request will not be completed automatically.</Text> : null}
            {warning && warning.unsyncedCount > 0 ? (
              <Text variant="bodyMedium">
                {warning.unsyncedCount} item(s) are not synchronised yet. The app will try to send them now; anything that cannot be sent is
                discarded.
              </Text>
            ) : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setWarning(null)}>Stay signed in</Button>
            <Button onPress={() => void doLogout(true)} loading={busy}>
              Sign out
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({ container: { padding: 16, gap: 12 } });
