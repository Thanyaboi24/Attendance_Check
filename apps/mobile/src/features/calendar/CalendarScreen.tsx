import { addDays, type HolidayDto, toBangkokDate } from '@attendance/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette } from '../../app/theme';
import { holidayName } from '../../domain/holidays';
import { isLanguage } from '../../i18n';
import { dateTime, dayLong, dayMonth, dayShort } from '../../i18n/format';
import { Notice } from '../../ui/kit';
import { buildMonthGrid, type CalendarCell, dayKind, monthOf, nextHoliday, shiftMonth } from './calendarModel';
import { useHolidays } from './useHolidays';

const ROSE = { fill: '#E11D48', fillDark: '#9F1239', soft: '#FFE4E6', border: '#FDA4AF', text: '#BE123C', deep: '#881337' };
const WEEKEND_BG = '#F1F5F9';

/**
 * Holiday calendar (ปฏิทิน): month grid Mon–Sun with holidays highlighted, the selected day's details, the month's
 * holidays and the next holiday. On a holiday check-in is closed; the grid is plain Views (no native calendar).
 */
export function CalendarScreen() {
  const { t, i18n } = useTranslation('calendar');
  const lang = isLanguage(i18n.language) ? i18n.language : 'en';
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [today, setToday] = useState(() => toBangkokDate(new Date()));
  const [ym, setYm] = useState(() => monthOf(today));
  const [selected, setSelected] = useState<string>(today);

  // The grid's date range (including the neighbouring months' days in the first / last week).
  const range = useMemo(() => {
    const g = buildMonthGrid(ym.year, ym.month, [], today, lang);
    const first = g.weeks[0]?.[0]?.date ?? g.from;
    const lastWeek = g.weeks[g.weeks.length - 1] ?? [];
    return { from: first, to: lastWeek[lastWeek.length - 1]?.date ?? g.to };
  }, [ym, today, lang]);

  const month = useHolidays(range.from, range.to);
  const upcoming = useHolidays(today, addDays(today, 365));

  // Refresh the cached calendar whenever the tab is opened (the geofence task reads the same cache).
  const refetchUpcoming = upcoming.refetch;
  useFocusEffect(
    useCallback(() => {
      setToday(toBangkokDate(new Date()));
      void refetchUpcoming();
    }, [refetchUpcoming]),
  );

  const grid = useMemo(() => buildMonthGrid(ym.year, ym.month, month.data?.holidays ?? [], today, lang), [ym, month.data, today, lang]);
  const next = useMemo(() => nextHoliday(upcoming.data?.holidays ?? [], today), [upcoming.data, today]);

  // Keep a selection inside the shown month: today, else the first holiday, else the 1st.
  useEffect(() => {
    if (selected >= grid.from && selected <= grid.to) return;
    setSelected(today >= grid.from && today <= grid.to ? today : (grid.holidays[0]?.date ?? grid.from));
  }, [grid, selected, today]);

  const selectedCell = useMemo(() => grid.weeks.flat().find((c) => c.date === selected) ?? null, [grid, selected]);
  const isCurrentMonth = today >= grid.from && today <= grid.to;
  const offline = month.data?.offline || upcoming.data?.offline;
  const fetchedAt = month.data?.fetchedAt ?? upcoming.data?.fetchedAt ?? null;
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ['holidays'] });
    setRefreshing(false);
  }

  function goToday() {
    setYm(monthOf(today));
    setSelected(today);
  }

  const name = (h: HolidayDto) => holidayName(h, lang);

  return (
    <ScrollView
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 24 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
    >
      <View style={{ gap: 4 }}>
        <Text style={styles.title}>{t('title')}</Text>
        <Text style={styles.subtitle}>{t('subtitle')}</Text>
      </View>

      {offline ? <Notice tone="amber">{fetchedAt ? t('offline', { time: dateTime(fetchedAt) }) : t('offlineNever')}</Notice> : null}

      {/* Next holiday */}
      <Pressable
        style={styles.hero}
        disabled={!next}
        onPress={() => {
          if (!next) return;
          setYm(monthOf(next.holiday.date));
          setSelected(next.holiday.date);
        }}
        accessibilityRole="button"
      >
        <View style={styles.heroIcon}>
          <MaterialCommunityIcons name="beach" size={28} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.heroKicker}>{t('upcoming')}</Text>
          {next ? (
            <>
              <Text style={styles.heroName} numberOfLines={2}>
                {name(next.holiday)}
              </Text>
              <Text style={styles.heroDate}>{dayLong(next.holiday.date, lang)}</Text>
            </>
          ) : (
            <Text style={styles.heroDate}>{upcoming.isLoading ? t('loading') : t('noUpcoming')}</Text>
          )}
        </View>
        {next ? (
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>
              {next.inDays === 0 ? t('isToday') : next.inDays === 1 ? t('tomorrow') : t('inDays', { count: next.inDays })}
            </Text>
          </View>
        ) : null}
      </Pressable>

      {/* Month grid */}
      <View style={styles.card}>
        <View style={styles.monthRow}>
          <Text style={styles.monthTitle}>{grid.title}</Text>
          {!isCurrentMonth ? (
            <Pressable onPress={goToday} accessibilityRole="button" style={styles.todayBtn} hitSlop={6}>
              <Text style={styles.todayText}>{t('today')}</Text>
            </Pressable>
          ) : null}
          <RoundIcon icon="chevron-left" label={t('previous')} onPress={() => setYm(shiftMonth(ym, -1))} />
          <RoundIcon icon="chevron-right" label={t('next')} onPress={() => setYm(shiftMonth(ym, 1))} />
        </View>

        <View style={styles.weekRow}>
          {grid.weekdays.map((w, i) => (
            <Text key={w} style={[styles.weekday, i >= 5 ? styles.weekdayWeekend : null]}>
              {w}
            </Text>
          ))}
        </View>

        <View style={{ gap: 4 }}>
          {grid.weeks.map((week) => (
            <View key={week[0]?.date} style={styles.weekRow}>
              {week.map((cell) => (
                <DayCell
                  key={cell.date}
                  cell={cell}
                  selected={cell.date === selected}
                  onPress={() => {
                    if (!cell.inMonth) setYm(monthOf(cell.date));
                    setSelected(cell.date);
                  }}
                  lang={lang}
                />
              ))}
            </View>
          ))}
        </View>

        <View style={styles.legend}>
          <Legend swatch={<View style={[styles.swatch, { backgroundColor: ROSE.fill }]} />} text={t('legend.holiday')} />
          <Legend swatch={<View style={[styles.swatch, { backgroundColor: WEEKEND_BG, borderWidth: 1, borderColor: palette.border }]} />} text={t('legend.weekend')} />
          <Legend swatch={<View style={[styles.swatch, { borderWidth: 2, borderColor: palette.blue }]} />} text={t('legend.today')} />
        </View>
      </View>

      {/* Selected day */}
      {selectedCell ? <DayDetails cell={selectedCell} lang={lang} /> : null}

      {/* This month's holidays */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('monthHolidays')}</Text>
        {month.isLoading ? (
          <Text style={styles.muted}>{t('loading')}</Text>
        ) : grid.holidays.length === 0 ? (
          <Text style={styles.muted}>{t('noHolidays')}</Text>
        ) : (
          grid.holidays.map((h, i) => (
            <Pressable
              key={h.id}
              onPress={() => setSelected(h.date)}
              accessibilityRole="button"
              style={[styles.holidayRow, i > 0 ? styles.divider : null, h.date === selected ? styles.holidayRowSelected : null]}
            >
              <View style={styles.dateBadge}>
                <Text style={styles.dateBadgeDay}>{Number(h.date.slice(8))}</Text>
                <Text style={styles.dateBadgeWd}>{dayShort(h.date, lang).split(' ')[0]}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.holidayName}>{name(h)}</Text>
                <Text style={styles.muted}>
                  {t(`type.${h.type}`)} · {dayMonth(h.date, lang)}
                </Text>
              </View>
              {h.date === today ? <MaterialCommunityIcons name="lock" size={18} color={ROSE.text} /> : null}
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function DayCell({ cell, selected, onPress, lang }: { cell: CalendarCell; selected: boolean; onPress(): void; lang: 'en' | 'th' }) {
  const { t } = useTranslation('calendar');
  const kind = dayKind(cell);
  const holiday = cell.holiday != null;
  const status = holiday && cell.holiday ? `${holidayName(cell.holiday, lang)}, ${t('checkInClosed')}` : t(`kind.${kind}`);
  // Exact pixel size: Android draws a large or percentage radius on a percentage-sized view as a square.
  // Screen − container padding (2×20) − card padding and border (2×17) − 6 gaps of 4 px, over 7 columns.
  const { width } = useWindowDimensions();
  const circle = Math.floor(((width - 40 - 34 - 24) / 7) * 0.86);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.cell, cell.weekend && !holiday ? styles.cellWeekend : null, !cell.inMonth ? { opacity: 0.35 } : null]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={t('dayA11y', { date: dayLong(cell.date, lang), status })}
    >
      <View
        style={[
          styles.dayCircle,
          { width: circle, height: circle, borderRadius: circle / 2 },
          holiday ? { backgroundColor: selected ? ROSE.fillDark : ROSE.fill } : selected ? { backgroundColor: palette.text } : null,
          cell.today ? styles.todayRing : null,
        ]}
      >
        <Text
          style={[
            styles.dayNum,
            cell.weekend ? { color: palette.textMuted } : null,
            holiday || selected ? { color: '#FFFFFF', fontWeight: '800' } : null,
            cell.today && !holiday && !selected ? { color: palette.blue, fontWeight: '800' } : null,
          ]}
        >
          {cell.day}
        </Text>
      </View>
    </Pressable>
  );
}

function DayDetails({ cell, lang }: { cell: CalendarCell; lang: 'en' | 'th' }) {
  const { t } = useTranslation('calendar');
  const kind = dayKind(cell);
  const h = cell.holiday;
  return (
    <View style={[styles.card, h ? styles.detailHoliday : null]}>
      <View style={styles.detailTop}>
        <MaterialCommunityIcons
          name={h ? 'beach' : kind === 'WEEKEND' ? 'sofa-outline' : 'briefcase-outline'}
          size={26}
          color={h ? ROSE.text : palette.textSoft}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.detailDate}>{dayLong(cell.date, lang)}</Text>
          <Text style={[styles.detailKind, h ? { color: ROSE.text } : null]}>{h ? t(`type.${h.type}`) : t(`kind.${kind}`)}</Text>
        </View>
      </View>
      {h ? (
        <>
          <Text style={styles.detailName}>{holidayName(h, lang)}</Text>
          {lang === 'th' ? null : h.nameTh ? <Text style={styles.detailAlt}>{h.nameTh}</Text> : null}
          {h.note ? <Text style={styles.detailNote}>{h.note}</Text> : null}
          <View style={styles.closedPill}>
            <MaterialCommunityIcons name="lock" size={16} color={ROSE.text} />
            <Text style={styles.closedText}>{t('checkInClosed')}</Text>
          </View>
          <Text style={styles.detailBody}>{t('holidayDetail')}</Text>
        </>
      ) : (
        <>
          <View style={styles.openPill}>
            <MaterialCommunityIcons name="check-circle-outline" size={16} color={palette.greenText} />
            <Text style={styles.openText}>{kind === 'WEEKEND' ? t('kind.WEEKEND') : t('kind.WORKING')}</Text>
          </View>
          <Text style={styles.detailBody}>{kind === 'WEEKEND' ? t('weekendDetail') : t('workingDetail')}</Text>
        </>
      )}
    </View>
  );
}

function RoundIcon({ icon, label, onPress }: { icon: 'chevron-left' | 'chevron-right'; label: string; onPress(): void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.round} hitSlop={4}>
      <MaterialCommunityIcons name={icon} size={24} color={palette.text} />
    </Pressable>
  );
}

function Legend({ swatch, text }: { swatch: React.ReactNode; text: string }) {
  return (
    <View style={styles.legendItem}>
      {swatch}
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16, paddingBottom: 32 },
  title: { fontSize: 30, fontWeight: '800', color: palette.text },
  subtitle: { fontSize: 14, lineHeight: 20, color: palette.textMuted },
  muted: { fontSize: 13, color: palette.textMuted },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: ROSE.fill, borderRadius: 22, padding: 18, elevation: 3 },
  heroIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  heroKicker: { fontSize: 13, fontWeight: '700', color: '#FFE4E6', textTransform: 'uppercase', letterSpacing: 0.4 },
  heroName: { fontSize: 19, fontWeight: '800', color: '#FFFFFF' },
  heroDate: { fontSize: 13, color: '#FFE4E6' },
  heroBadge: { backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  heroBadgeText: { fontSize: 13, fontWeight: '800', color: ROSE.deep },
  card: { backgroundColor: palette.surface, borderRadius: 20, borderWidth: 1, borderColor: palette.border, padding: 16, gap: 12 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: palette.text },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: palette.text },
  todayBtn: { borderRadius: 999, borderWidth: 1, borderColor: palette.blue, paddingHorizontal: 12, paddingVertical: 6 },
  todayText: { fontSize: 13, fontWeight: '700', color: palette.blue },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.background,
    borderWidth: 1,
    borderColor: palette.border,
  },
  weekRow: { flexDirection: 'row', gap: 4 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: palette.textSoft },
  weekdayWeekend: { color: palette.textMuted },
  cell: { flex: 1, aspectRatio: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cellWeekend: { backgroundColor: WEEKEND_BG },
  dayCircle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  todayRing: { borderWidth: 2.5, borderColor: palette.blue },
  dayNum: { fontSize: 16, fontWeight: '600', color: palette.text },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 14, height: 14, borderRadius: 7 },
  legendText: { fontSize: 12, color: palette.textSoft },
  detailHoliday: { backgroundColor: '#FFF1F2', borderColor: ROSE.border },
  detailTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailDate: { fontSize: 16, fontWeight: '700', color: palette.text },
  detailKind: { fontSize: 13, fontWeight: '600', color: palette.textMuted },
  detailName: { fontSize: 20, fontWeight: '800', color: ROSE.deep },
  detailAlt: { fontSize: 14, color: ROSE.text },
  detailNote: { fontSize: 13, lineHeight: 19, color: palette.textSoft, fontStyle: 'italic' },
  detailBody: { fontSize: 14, lineHeight: 20, color: palette.textSoft },
  closedPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: ROSE.soft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  closedText: { fontSize: 13, fontWeight: '700', color: ROSE.text },
  openPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.greenSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  openText: { fontSize: 13, fontWeight: '700', color: palette.greenText },
  holidayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 12 },
  holidayRowSelected: { backgroundColor: '#FFF1F2' },
  divider: { borderTopWidth: 1, borderTopColor: palette.border },
  dateBadge: { width: 48, height: 52, borderRadius: 12, backgroundColor: ROSE.soft, alignItems: 'center', justifyContent: 'center' },
  dateBadgeDay: { fontSize: 18, fontWeight: '800', color: ROSE.text },
  dateBadgeWd: { fontSize: 11, fontWeight: '600', color: ROSE.text },
  holidayName: { fontSize: 15, fontWeight: '700', color: palette.text },
});
