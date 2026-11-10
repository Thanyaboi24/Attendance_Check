import { AttendanceState, RequestType, toBangkokDate } from '@attendance/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { refreshDashboard, syncNow } from '../../app/controller';
import { palette } from '../../app/theme';
import { displayStatusOf, reasonText } from '../../domain/displayStatus';
import { useAppStore } from '../../store/appStore';
import { fmtDateTime, fmtTime, MonitoringBanner, STATE_LABEL, StatusChip } from '../../ui/components';
import { BigButton, mono, Panel } from '../../ui/kit';
import { dayLabel, METHOD_LABEL } from '../history/historyModel';
import { LocationCard } from '../locationMap/LocationCard';
import { autoRequirementNote } from '../locationMap/locationModel';
import { useDisplayFix } from '../locationMap/useDisplayFix';
import { ConfirmResultDialog } from './ConfirmResultDialog';
import { PendingRequestCard } from './PendingRequestCard';
import { buildTodayTimeline, type TimelineTone } from './timelineModel';
import { useConfirmFlow } from './useConfirmFlow';

/** "Synced" / "N waiting" / "Offline" pill in the header (pages 3–4). */
function SyncPill({ pending, failed, online }: { pending: number; failed: number; online: boolean }) {
  const [bg, fg, text] =
    failed > 0
      ? ['#FEE2E2', '#B91C1C', `${failed} failed`]
      : pending > 0
        ? ['#EDE9FE', '#6D28D9', `${pending} waiting`]
        : online
          ? [palette.greenSoft, palette.greenText, 'Synced']
          : [palette.graySoft, palette.textSoft, 'Offline'];
  return (
    <View style={[styles.syncPill, { backgroundColor: bg }]} accessibilityLabel={`Synchronisation: ${text}`}>
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <Text style={[styles.syncText, { color: fg }]}>{text}</Text>
    </View>
  );
}

const STATE_LOOK: Record<AttendanceState, { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; fg: string; bg: string }> = {
  CHECKED_IN: { icon: 'check', fg: palette.greenText, bg: palette.greenSoft },
  CHECKED_OUT: { icon: 'logout-variant', fg: palette.textSoft, bg: palette.graySoft },
  PENDING_CHECK_IN: { icon: 'timer-sand', fg: palette.amberText, bg: palette.amberSoft },
  PENDING_CHECK_OUT: { icon: 'timer-sand', fg: palette.amberText, bg: palette.amberSoft },
};

const TONE_DOT: Record<TimelineTone, string> = {
  neutral: '#94A3B8',
  pending: '#F59E0B',
  success: '#16A34A',
  problem: '#DC2626',
};

function TimeBox({ title, time, sub }: { title: string; time: string | null; sub: string }) {
  return (
    <View style={styles.timeBox}>
      <Text style={styles.muted}>{title}</Text>
      <Text style={[styles.time, mono, !time && { color: '#94A3B8' }]}>{time ?? '--:--'}</Text>
      <Text style={[styles.method, !time && { color: palette.textMuted, fontWeight: '400' }]}>{sub}</Text>
    </View>
  );
}

/** Mockup pages 3–4 (design §12.4): status or pending request, location, today's timeline, sync banner. */
export function DashboardScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const user = useAppStore((s) => s.user);
  const model = useAppStore((s) => s.dashboard);
  const monitoring = useAppStore((s) => s.monitoring);
  const online = useAppStore((s) => s.online);
  const lastFix = useAppStore((s) => s.lastFix);
  const intent = useAppStore((s) => s.notificationIntent);
  const confirm = useConfirmFlow();
  const runConfirm = confirm.run;
  const loc = useDisplayFix(model?.config ?? null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useFocusEffect(
    useCallback(() => {
      void refreshDashboard();
      setNow(new Date());
      // Keeps "Updated 2 min ago" current while the screen is visible.
      const t = setInterval(() => setNow(new Date()), 30_000);
      return () => clearInterval(t);
    }, []),
  );

  // Check In / Check Out pressed on the notification → confirm with a fresh foreground fix.
  useEffect(() => {
    if (!intent) return;
    useAppStore.getState().setNotificationIntent(null);
    if (intent.action === 'CHECK_IN' || intent.action === 'CHECK_OUT') void runConfirm(intent.requestId, 'NOTIFICATION', intent.at);
  }, [intent, runConfirm]);

  async function onRefresh() {
    setRefreshing(true);
    await syncNow();
    setRefreshing(false);
  }

  if (!model) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const today = toBangkokDate(now);
  const todaySessions = model.todaySessions.filter((s) => toBangkokDate(s.checkInAt) === today);
  // An open session may have started on an earlier day; it is still the one to show.
  const first = model.openSession ?? todaySessions[0] ?? null;
  /** "Manual", or "1 Nov · Manual" when the time is not from today. */
  const sub = (iso: string, method: string) => (toBangkokDate(iso) === today ? method : `${dayLabel(toBangkokDate(iso)).slice(4)} · ${method}`);
  const lastOutSession = [...todaySessions].reverse().find((s) => s.checkOutAt) ?? null;
  const pending = model.pending;
  const issues = model.recent.filter((r) => ['FAILED', 'UNCERTAIN_LOCATION'].includes(displayStatusOf(r)));
  const timeline = buildTodayTimeline(model.recent, model.todaySessions, now);
  const look = STATE_LOOK[model.state];
  const checkedIn = model.state === AttendanceState.CHECKED_IN;

  return (
    <ScrollView
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.welcome}>Welcome, {user?.fullName ?? 'Staff'}</Text>
          <Text style={styles.title}>Attendance</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable onPress={() => navigation.navigate('Settings')} accessibilityRole="button" accessibilityLabel="Settings" hitSlop={10} style={styles.gear}>
            <MaterialCommunityIcons name="cog-outline" size={26} color={palette.textSoft} />
          </Pressable>
          <SyncPill pending={model.outboxCount} failed={model.failedOutboxCount} online={online} />
        </View>
      </View>

      <MonitoringBanner status={monitoring} onFix={() => navigation.navigate('Permissions')} />

      {pending ? (
        <PendingRequestCard request={pending} busy={confirm.state.busy} onConfirm={() => void confirm.run(pending.requestId, 'DASHBOARD')} />
      ) : (
        <Panel style={{ gap: 16 }}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>Current status</Text>
            <Text style={styles.muted}>Staff ID {user?.staffId}</Text>
          </View>
          <View style={styles.stateRow}>
            <View style={[styles.stateIcon, { backgroundColor: look.bg }]}>
              <MaterialCommunityIcons name={look.icon} size={32} color={look.fg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.state, { color: checkedIn ? palette.greenText : palette.text }]}>{STATE_LABEL[model.state]}</Text>
              <Text style={styles.muted}>
                {model.openSession
                  ? `Session open since ${toBangkokDate(model.openSession.checkInAt) === today ? fmtTime(model.openSession.checkInAt) : fmtDateTime(model.openSession.checkInAt)}`
                  : model.snapshotFetchedAt
                    ? `Updated from the server at ${fmtTime(model.snapshotFetchedAt)}`
                    : 'Not synchronised yet'}
              </Text>
            </View>
          </View>
          <View style={styles.times}>
            <TimeBox title="Check-in" time={first ? fmtTime(first.checkInAt) : null} sub={first ? sub(first.checkInAt, METHOD_LABEL[first.checkInMethod]) : 'Not yet'} />
            <TimeBox
              title="Check-out"
              time={lastOutSession?.checkOutAt ? fmtTime(lastOutSession.checkOutAt) : null}
              sub={lastOutSession?.checkOutAt && lastOutSession.checkOutMethod ? sub(lastOutSession.checkOutAt, METHOD_LABEL[lastOutSession.checkOutMethod]) : 'Not yet'}
            />
          </View>
        </Panel>
      )}

      <LocationCard
        cfg={model.config}
        fix={lastFix}
        detailed={pending != null}
        note={pending ? autoRequirementNote(pending.type, lastFix?.classification ?? null) : null}
        busy={loc.busy}
        error={loc.error}
        now={now}
        onMap={() => navigation.navigate('LocationMap')}
        onRefresh={() => void loc.refresh()}
      />

      {timeline.length > 0 ? (
        <Panel style={{ gap: 14 }}>
          <Text style={styles.label}>Today</Text>
          {timeline.map((t, i) => (
            <View key={`${t.at}-${i}`} style={styles.timelineRow}>
              <Text style={[styles.timelineTime, mono]}>{t.time}</Text>
              <View style={[styles.timelineDot, { backgroundColor: TONE_DOT[t.tone] }]} />
              <Text style={styles.timelineText}>{t.text}</Text>
            </View>
          ))}
        </Panel>
      ) : null}

      {issues.length > 0 ? (
        <Panel style={{ gap: 12 }}>
          <Text style={styles.label}>Needs attention</Text>
          {issues.slice(0, 3).map((r) => (
            <Pressable
              key={r.requestId}
              style={styles.issue}
              onPress={() =>
                navigation.navigate('Correction', {
                  workDate: toBangkokDate(r.geofenceDetectedAt),
                  requestId: r.requestId,
                  statusLabel: 'Unresolved',
                })
              }
              accessibilityRole="button"
            >
              <View style={styles.rowBetween}>
                <Text style={styles.issueTitle}>
                  {r.type === RequestType.CHECK_IN ? 'Check-in' : 'Check-out'} · {fmtDateTime(r.geofenceDetectedAt)}
                </Text>
                <StatusChip status={displayStatusOf(r)} compact />
              </View>
              <Text style={styles.muted}>{reasonText(r.resolutionReason ?? r.lastError) ?? ''}</Text>
              <Text style={styles.link}>Request a correction</Text>
            </Pressable>
          ))}
        </Panel>
      ) : null}

      {!pending && checkedIn ? (
        <View style={{ gap: 10 }}>
          <BigButton variant="outline" disabled onPress={() => undefined}>
            Check out now
          </BigButton>
          <Text style={[styles.muted, { textAlign: 'center' }]}>Check-out is available once you are outside the area.</Text>
        </View>
      ) : null}

      {model.outboxCount + model.failedOutboxCount > 0 ? (
        <Pressable style={styles.syncBanner} onPress={() => void syncNow()} accessibilityRole="button" accessibilityHint="Synchronise now">
          <MaterialCommunityIcons name="sync" size={22} color={palette.textSoft} />
          <Text style={styles.syncBannerText}>
            {model.failedOutboxCount > 0
              ? `Synchronization failed · ${model.failedOutboxCount} action${model.failedOutboxCount === 1 ? '' : 's'} · tap to retry`
              : `Pending synchronization · ${model.outboxCount} action${model.outboxCount === 1 ? '' : 's'} waiting`}
          </Text>
        </Pressable>
      ) : null}

      <ConfirmResultDialog
        outcome={confirm.state.outcome}
        onClose={confirm.close}
        onRetry={() => {
          const id = confirm.state.requestId;
          confirm.close();
          if (id) void confirm.run(id, 'DASHBOARD');
        }}
        onCorrection={() => {
          confirm.close();
          navigation.navigate('Correction', { workDate: today, requestId: confirm.state.requestId ?? undefined });
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 4 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  gear: { padding: 6 },
  welcome: { fontSize: 15, color: palette.textSoft },
  title: { fontSize: 30, fontWeight: '800', color: palette.text },
  syncPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  syncText: { fontSize: 15, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { fontSize: 15, fontWeight: '700', color: palette.textSoft },
  muted: { fontSize: 14, lineHeight: 20, color: palette.textMuted },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stateIcon: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  state: { fontSize: 30, fontWeight: '800' },
  times: { flexDirection: 'row', gap: 12 },
  timeBox: { flex: 1, backgroundColor: palette.background, borderRadius: 14, padding: 16, gap: 4 },
  time: { fontSize: 28, color: palette.text },
  method: { fontSize: 15, fontWeight: '700', color: palette.blue },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  timelineTime: { fontSize: 16, color: palette.textSoft, width: 54 },
  timelineDot: { width: 10, height: 10, borderRadius: 5 },
  timelineText: { flex: 1, fontSize: 16, color: palette.text },
  issue: { gap: 4, paddingTop: 4 },
  issueTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: palette.text },
  link: { fontSize: 15, fontWeight: '700', color: palette.blue },
  syncBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.graySoft, borderRadius: 14, padding: 14 },
  syncBannerText: { flex: 1, fontSize: 15, color: palette.textSoft },
});
