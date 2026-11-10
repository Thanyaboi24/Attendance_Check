import { formatBangkokTime, toBangkokDate } from '@attendance/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { RadioButton, Text, TextInput } from 'react-native-paper';
import { DatePickerModal, en, registerTranslation, TimePickerModal } from 'react-native-paper-dates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDeps } from '../../app/container';
import type { RootStackParamList } from '../../app/navigation/types';
import { palette } from '../../app/theme';
import { submitCorrection } from '../../domain/useCases/submitCorrection';
import { BigButton, mono, Notice, Panel, Pill } from '../../ui/kit';
import { longDayLabel } from '../history/historyModel';
import { correctionTimes, defaultFix, type FixKind, fixOptions, needsCheckIn, needsCheckOut, to12h } from './correctionModel';

registerTranslation('en', en);

const pad = (n: number) => String(n).padStart(2, '0');

/** Field that opens the clock picker ("05:05 PM" + clock icon, page 7). */
function TimeField({ label, value, onChange }: { label: string; value: string; onChange(v: string): void }) {
  const [open, setOpen] = useState(false);
  const [h, m] = value ? value.split(':').map(Number) : [9, 0];
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label}: ${value ? to12h(value) : 'not set'}`}>
        <Text style={[styles.fieldText, !value && { color: palette.textMuted }]}>{value ? to12h(value) : 'Choose a time'}</Text>
        <MaterialCommunityIcons name="clock-outline" size={24} color={palette.text} />
      </Pressable>
      <TimePickerModal
        visible={open}
        locale="en"
        hours={h}
        minutes={m}
        onDismiss={() => setOpen(false)}
        onConfirm={({ hours, minutes }) => {
          setOpen(false);
          onChange(`${pad(hours)}:${pad(minutes)}`);
        }}
      />
    </View>
  );
}

/** FR09 / mockup page 7: what needs fixing, the correct Bangkok time(s), and a required reason. */
export function CorrectionScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Correction'>>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const params = route.params ?? {};
  const session = params.sessionId || params.checkInAt ? { checkInAt: params.checkInAt ?? null, checkOutAt: params.checkOutAt ?? null } : null;

  const [workDate, setWorkDate] = useState(params.workDate ?? toBangkokDate(new Date()));
  const [kind, setKind] = useState<FixKind>(defaultFix(session));
  const [checkIn, setCheckIn] = useState(session?.checkInAt ? formatBangkokTime(session.checkInAt) : '');
  const [checkOut, setCheckOut] = useState(session?.checkOutAt ? formatBangkokTime(session.checkOutAt) : '');
  const [reason, setReason] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The date can only be changed when the request is not about an existing session.
  const dateEditable = !params.sessionId && !params.workDate;

  async function onSubmit() {
    setError(null);
    const times = correctionTimes(kind, workDate, checkIn, checkOut);
    if (!times.ok) return setError(times.message);
    if (reason.trim().length < 5) return setError('Please describe the reason (at least 5 characters).');
    setBusy(true);
    try {
      const deps = await getDeps();
      const out = await submitCorrection(deps, {
        sessionId: params.sessionId ?? null,
        workDate,
        requestedCheckInAt: times.requestedCheckInAt,
        requestedCheckOutAt: times.requestedCheckOutAt,
        reason: reason.trim(),
      });
      switch (out.kind) {
        case 'SUBMITTED':
          await qc.invalidateQueries({ queryKey: ['corrections'] });
          setDone('Submitted. An attendance administrator will review your request.');
          break;
        case 'PENDING_SYNC':
          setDone('Saved on this phone. It will be sent when the connection returns (Pending synchronization).');
          break;
        case 'INVALID':
        case 'ERROR':
          setError(out.message);
          break;
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <View style={[styles.screen, styles.doneBox]}>
        <MaterialCommunityIcons name="check-circle-outline" size={64} color={palette.greenText} />
        <Text style={styles.doneText}>{done}</Text>
        <View style={{ alignSelf: 'stretch', gap: 12 }}>
          <BigButton onPress={() => navigation.navigate('Main', { screen: 'Requests' })}>View my requests</BigButton>
          <BigButton variant="outline" onPress={() => navigation.goBack()}>
            Back
          </BigButton>
        </View>
      </View>
    );
  }

  const inOut = session
    ? `In ${session.checkInAt ? formatBangkokTime(session.checkInAt) : '--:--'} · Out ${session.checkOutAt ? formatBangkokTime(session.checkOutAt) : '--:--'}`
    : 'No attendance recorded';

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="height">
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: 24 }]} keyboardShouldPersistTaps="handled">
        <Panel style={styles.session}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.muted}>{session ? 'Session' : 'Date'}</Text>
            <Pressable disabled={!dateEditable} onPress={() => setDateOpen(true)} accessibilityRole={dateEditable ? 'button' : undefined}>
              <Text style={styles.sessionDate}>
                {longDayLabel(workDate)}
                {dateEditable ? '  ' : ''}
                {dateEditable ? <MaterialCommunityIcons name="calendar-edit" size={20} color={palette.blue} /> : null}
              </Text>
            </Pressable>
            <Text style={[styles.inOut, mono]}>{inOut}</Text>
          </View>
          {params.statusLabel ? <Pill tone="amber">{params.statusLabel}</Pill> : null}
        </Panel>

        <Text style={styles.label}>What needs fixing?</Text>
        <RadioButton.Group onValueChange={(v) => setKind(v as FixKind)} value={kind}>
          <View style={{ gap: 10 }}>
            {fixOptions(session).map((o) => {
              const selected = o.kind === kind;
              return (
                <Pressable key={o.kind} onPress={() => setKind(o.kind)} style={[styles.option, selected && styles.optionOn]} accessibilityRole="radio" accessibilityState={{ checked: selected }}>
                  <RadioButton.Android value={o.kind} color={palette.blue} />
                  <Text style={[styles.optionText, selected && { fontWeight: '700' }]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </RadioButton.Group>

        {needsCheckIn(kind) ? <TimeField label="Correct check-in time" value={checkIn} onChange={setCheckIn} /> : null}
        {needsCheckOut(kind) ? <TimeField label="Correct check-out time" value={checkOut} onChange={setCheckOut} /> : null}

        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Reason (required)</Text>
          <TextInput
            mode="outlined"
            accessibilityLabel="Reason"
            placeholder="e.g. Phone battery ran out before I left the building."
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={4}
            style={{ minHeight: 120, backgroundColor: palette.surface }}
            outlineStyle={{ borderRadius: 16 }}
          />
        </View>

        <Text style={styles.muted}>An attendance administrator reviews your request. The original record is kept and the change is logged.</Text>
        {error ? <Notice tone="red">{error}</Notice> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <BigButton onPress={() => void onSubmit()} busy={busy}>
          Submit request
        </BigButton>
      </View>

      <DatePickerModal
        locale="en"
        mode="single"
        visible={dateOpen}
        date={new Date(`${workDate}T12:00:00`)}
        validRange={{ endDate: new Date() }}
        onDismiss={() => setDateOpen(false)}
        onConfirm={({ date }) => {
          setDateOpen(false);
          if (date) setWorkDate(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  container: { padding: 20, gap: 16 },
  session: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  muted: { fontSize: 14, lineHeight: 21, color: palette.textMuted },
  sessionDate: { fontSize: 20, fontWeight: '700', color: palette.text },
  inOut: { fontSize: 16, color: palette.textSoft },
  label: { fontSize: 16, fontWeight: '700', color: palette.textSoft },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, paddingVertical: 8, paddingHorizontal: 12 },
  optionOn: { borderColor: palette.blue, borderWidth: 2, backgroundColor: palette.blueSoft },
  optionText: { fontSize: 17, color: palette.text },
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 58, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: palette.surface },
  fieldText: { fontSize: 18, color: palette.text },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: palette.background },
  doneBox: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 },
  doneText: { fontSize: 18, lineHeight: 26, textAlign: 'center', color: palette.text },
});
