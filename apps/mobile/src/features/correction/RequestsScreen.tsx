import { type CorrectionDto, type CorrectionStatus, formatBangkokDateTime, formatBangkokTime } from '@attendance/shared';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import React, { useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDeps } from '../../app/container';
import { palette } from '../../app/theme';
import { isNetworkError } from '../../domain/errors';
import { BigButton, mono, Pill, type PillTone } from '../../ui/kit';
import { longDayLabel } from '../history/historyModel';

const STATUS: Record<CorrectionStatus, { label: string; tone: PillTone }> = {
  PENDING: { label: 'Waiting for review', tone: 'amber' },
  APPROVED: { label: 'Approved', tone: 'green' },
  REJECTED: { label: 'Rejected', tone: 'red' },
};

const time = (iso: string | null) => (iso ? formatBangkokTime(iso) : '--:--');

function RequestCard({ c }: { c: CorrectionDto }) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.day}>{longDayLabel(c.workDate)}</Text>
        <Pill tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Pill>
      </View>
      <Text style={[styles.times, mono]}>
        {[c.requestedCheckInAt ? `In ${time(c.requestedCheckInAt)}` : null, c.requestedCheckOutAt ? `Out ${time(c.requestedCheckOutAt)}` : null]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      <Text style={styles.reason}>{c.reason}</Text>
      {c.reviewNote ? (
        <View style={styles.review}>
          <Text style={styles.reviewLabel}>
            Reviewer{c.reviewer ? ` · ${c.reviewer.fullName}` : ''}
            {c.reviewedAt ? ` · ${formatBangkokDateTime(c.reviewedAt)}` : ''}
          </Text>
          <Text style={styles.reason}>{c.reviewNote}</Text>
        </View>
      ) : null}
      <Text style={styles.muted}>Submitted {formatBangkokDateTime(c.createdAt)}</Text>
    </View>
  );
}

/** Requests tab (mockups pages 3–6 tab bar): the user's correction requests and their review status (FR09). */
export function RequestsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const query = useQuery({ queryKey: ['corrections'], queryFn: async () => (await getDeps()).api.listCorrections() });
  const refetch = query.refetch;

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const items = [...(query.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <FlatList
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 24 }]}
      data={items}
      keyExtractor={(c) => c.id}
      refreshing={query.isFetching && !query.isLoading}
      onRefresh={() => void query.refetch()}
      ListHeaderComponent={
        <View style={{ gap: 16 }}>
          <Text style={styles.title}>Correction requests</Text>
          <Text style={styles.muted}>Ask an attendance administrator to fix a missing or wrong check-in or check-out.</Text>
          <BigButton onPress={() => navigation.navigate('Correction', {})}>New request</BigButton>
          {query.isError ? (
            <Text style={styles.error}>{isNetworkError(query.error) ? 'Offline: requests are loaded from the server.' : 'Could not load your requests.'}</Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={query.isLoading ? <Text style={styles.empty}>Loading…</Text> : <Text style={styles.empty}>You have not submitted any correction requests.</Text>}
      renderItem={({ item }) => <RequestCard c={item} />}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14 },
  title: { fontSize: 30, fontWeight: '800', color: palette.text },
  muted: { fontSize: 14, lineHeight: 20, color: palette.textMuted },
  error: { color: '#DC2626' },
  empty: { padding: 16, color: palette.textMuted },
  card: { backgroundColor: palette.surface, borderRadius: 20, borderWidth: 1, borderColor: palette.border, padding: 20, gap: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  day: { flex: 1, fontSize: 18, fontWeight: '700', color: palette.text },
  times: { fontSize: 16, color: palette.textSoft },
  reason: { fontSize: 15, lineHeight: 22, color: palette.text },
  review: { backgroundColor: palette.background, borderRadius: 12, padding: 12, gap: 4 },
  reviewLabel: { fontSize: 13, fontWeight: '600', color: palette.textSoft },
});
