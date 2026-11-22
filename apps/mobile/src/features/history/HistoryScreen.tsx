import { toBangkokDate } from '@attendance/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Menu, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDeps } from '../../app/container';
import { palette } from '../../app/theme';
import { isNetworkError } from '../../domain/errors';
import { mono, Pill, type PillTone } from '../../ui/kit';
import {
  buildHistoryCards,
  filterByMethod,
  type HistoryCard,
  type HistoryStatus,
  historyStatusLabel,
  methodFilterLabels,
  type MethodFilter,
  presetRange,
  type RangePreset,
  rangeLabel,
  rangePresetLabels,
} from './historyModel';

const STATUS_TONE: Record<HistoryStatus, PillTone> = {
  COMPLETED: 'gray',
  OPEN: 'green',
  NEEDS_REVIEW: 'amber',
  CORRECTED: 'purple',
};

/** Dropdown-looking button that opens a Paper menu. */
function Dropdown<T extends string>({
  value,
  label,
  options,
  onChange,
  chevron,
  grow,
}: {
  value: T;
  label: string;
  options: Record<T, string>;
  onChange(v: T): void;
  chevron?: boolean;
  grow?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchor={
        <Pressable style={[styles.dropdown, grow ? { flex: 1 } : null]} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label}>
          <Text style={styles.dropdownText} numberOfLines={1}>
            {label}
          </Text>
          {chevron ? <MaterialCommunityIcons name="chevron-down" size={24} color={palette.textSoft} /> : null}
        </Pressable>
      }
      style={grow ? { flex: 1 } : undefined}
    >
      {(Object.keys(options) as T[]).map((k) => (
        <Menu.Item
          key={k}
          title={options[k]}
          leadingIcon={k === value ? 'check' : undefined}
          onPress={() => {
            setOpen(false);
            onChange(k);
          }}
        />
      ))}
    </Menu>
  );
}

function TimeColumn({ title, time, label }: { title: string; time: string | null; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={styles.colTitle}>{title}</Text>
      <Text style={[styles.time, mono]}>{time ?? '--:--'}</Text>
      {label ? <Text style={styles.method}>{label}</Text> : null}
    </View>
  );
}

/** Mockup page 6: own history only (the backend uses the user id from the token). Dates are Bangkok calendar days. */
export function HistoryScreen() {
  const { t, i18n } = useTranslation('history');
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const today = toBangkokDate(new Date());
  const [preset, setPreset] = useState<RangePreset>('THIS_WEEK');
  const [method, setMethod] = useState<MethodFilter>('ALL');
  const { from, to } = presetRange(preset, today);

  const query = useQuery({
    queryKey: ['history', from, to],
    queryFn: async () => (await getDeps()).api.history(from, to),
  });

  const cards = useMemo(
    () => filterByMethod(buildHistoryCards(query.data?.sessions ?? [], query.data?.issues ?? [], today), method),
    // Card labels are translated: rebuild when the language changes.
    [query.data, today, method, i18n.language],
  );

  function openCorrection(c: HistoryCard) {
    navigation.navigate('Correction', {
      sessionId: c.sessionId,
      workDate: c.workDate,
      checkInAt: c.checkInAt,
      checkOutAt: c.checkOutAt,
      statusLabel: c.status === 'NEEDS_REVIEW' ? (c.sessionId ? t('cell.unresolved') : t('cell.missing')) : historyStatusLabel(c.status),
    });
  }

  const methodLabels = methodFilterLabels();

  return (
    <FlatList
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 24 }]}
      data={cards}
      keyExtractor={(c) => c.key}
      refreshing={query.isFetching && !query.isLoading}
      onRefresh={() => void query.refetch()}
      ListHeaderComponent={
        <View style={{ gap: 16 }}>
          <Text style={styles.title}>{t('title')}</Text>
          <View style={styles.filters}>
            <Dropdown value={preset} label={rangeLabel(from, to)} options={rangePresetLabels()} onChange={setPreset} chevron grow />
            <Dropdown value={method} label={methodLabels[method]} options={methodLabels} onChange={setMethod} />
          </View>
          {query.isError ? (
            <Text style={styles.error}>{isNetworkError(query.error) ? t('offline') : t('loadFailed')}</Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={query.isLoading ? <Text style={styles.empty}>{t('loading')}</Text> : <Text style={styles.empty}>{t('empty')}</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.day}>{item.dayLabel}</Text>
            <Pill tone={STATUS_TONE[item.status]}>{historyStatusLabel(item.status)}</Pill>
          </View>
          <View style={styles.cols}>
            <TimeColumn title={t('in')} time={item.inTime} label={item.inLabel} />
            <TimeColumn title={t('out')} time={item.outTime} label={item.outLabel} />
          </View>
          {item.workedLabel ? (
            <View style={styles.worked}>
              <MaterialCommunityIcons name="timer-outline" size={18} color={palette.textSoft} />
              <Text style={styles.workedText}>{item.workedLabel}</Text>
            </View>
          ) : null}
          {item.needsCorrection ? (
            <Pressable onPress={() => openCorrection(item)} accessibilityRole="link" hitSlop={8}>
              <Text style={styles.link}>{t('requestCorrection')}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14 },
  title: { fontSize: 30, fontWeight: '800', color: palette.text },
  filters: { flexDirection: 'row', gap: 10 },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    height: 56,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: palette.surface,
  },
  dropdownText: { fontSize: 16, color: palette.text, flexShrink: 1 },
  error: { color: '#DC2626' },
  empty: { padding: 16, color: palette.textMuted },
  card: { backgroundColor: palette.surface, borderRadius: 20, borderWidth: 1, borderColor: palette.border, padding: 20, gap: 14 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  day: { flexShrink: 1, fontSize: 18, fontWeight: '700', color: palette.text },
  cols: { flexDirection: 'row', gap: 12 },
  colTitle: { fontSize: 14, color: palette.textMuted },
  time: { fontSize: 24, color: palette.text },
  method: { fontSize: 14, fontWeight: '600', color: palette.blue },
  link: { fontSize: 17, fontWeight: '700', color: palette.blue },
  worked: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.border },
  workedText: { fontSize: 15, fontWeight: '600', color: palette.textSoft },
});
