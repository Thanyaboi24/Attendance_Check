import { toBangkokDate, WORKDAY_STANDARD } from '@attendance/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SegmentedButtons, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDeps } from '../../app/container';
import { palette } from '../../app/theme';
import { isNetworkError } from '../../domain/errors';
import { holidayName } from '../../domain/holidays';
import { currentLanguage } from '../../i18n';
import { useHolidays } from '../calendar/useHolidays';
import { dateRange, dayShort } from '../../i18n/format';
import { mono, Notice, Pill, type PillTone } from '../../ui/kit';
import {
  decimalHours,
  type DayStandard,
  formatDuration,
  type HoursDay,
  type HoursPeriod,
  periodRange,
  shiftPeriod,
  standardGap,
  standardRangeLabel,
  summarizeHours,
} from './hoursModel';

const CHART_HEIGHT = 150;
/** The scale always shows the whole standard band (up to 10 h), so short and long days are easy to compare. */
const SCALE_FLOOR_MIN = WORKDAY_STANDARD.maxMinutes + 60;

/** Bar and label colours for each verdict against the 7–9 h standard. */
const STANDARD_COLOR: Record<DayStandard, string> = { BELOW: '#F59E0B', WITHIN: '#22C55E', ABOVE: '#6366F1' };
const STANDARD_TONE: Record<DayStandard, PillTone> = { BELOW: 'amber', WITHIN: 'green', ABOVE: 'purple' };
const RUNNING_COLOR = '#2563EB';
const HOLIDAY_COLOR = '#E11D48';

/**
 * Own working time per week or month. A day's working time is check-out minus check-in (summed when there are
 * several sessions), compared with the standard working day of 7–9 hours. Computed from the attendance history;
 * nothing new is stored.
 */
export function HoursScreen() {
  const { t, i18n } = useTranslation('hours');
  const insets = useSafeAreaInsets();
  const today = toBangkokDate(new Date());
  const [period, setPeriod] = useState<HoursPeriod>('WEEK');
  const [anchor, setAnchor] = useState(today);
  const { from, to } = periodRange(period, anchor);
  const isCurrent = today >= from && today <= to;

  // A running session keeps growing: tick once a minute while this tab is visible.
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      const id = setInterval(() => setNow(new Date()), 60_000);
      return () => clearInterval(id);
    }, []),
  );

  const query = useQuery({
    queryKey: ['history', from, to],
    queryFn: async () => (await getDeps()).api.history(from, to),
  });

  // Holidays are days off: shown as "Holiday · name" and left out of the 7–9 h judgement.
  const holidays = useHolidays(from, to);

  const summary = useMemo(
    () => summarizeHours(query.data?.sessions ?? [], from, to, now, holidays.data?.holidays ?? []),
    // Labels inside are translated at render time; i18n.language keeps formatted values in step.
    [query.data, holidays.data, from, to, now, i18n.language],
  );

  const listDays = useMemo(() => {
    const days = period === 'WEEK' ? summary.days : summary.days.filter((d) => d.sessions.length > 0 || d.holiday);
    return [...days].filter((d) => d.date <= today).reverse();
  }, [summary, period, today]);

  return (
    <ScrollView
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 24 }]}
      refreshControl={
        <RefreshControl
          refreshing={query.isFetching && !query.isLoading}
          onRefresh={() => {
            void query.refetch();
            void holidays.refetch();
          }}
        />
      }
    >
      <Text style={styles.title}>{t('title')}</Text>

      <SegmentedButtons
        value={period}
        onValueChange={(v) => setPeriod(v as HoursPeriod)}
        buttons={[
          { value: 'WEEK', label: t('period.WEEK'), icon: 'calendar-week' },
          { value: 'MONTH', label: t('period.MONTH'), icon: 'calendar-month' },
        ]}
      />

      <View style={styles.periodRow}>
        <RoundIcon icon="chevron-left" label={t('previous')} onPress={() => setAnchor(shiftPeriod(period, anchor, -1))} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.periodLabel}>{dateRange(from, to)}</Text>
          {!isCurrent ? (
            <Pressable onPress={() => setAnchor(today)} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.link}>{period === 'WEEK' ? t('backToNow') : t('backToNowMonth')}</Text>
            </Pressable>
          ) : null}
        </View>
        <RoundIcon icon="chevron-right" label={t('next')} onPress={() => setAnchor(shiftPeriod(period, anchor, 1))} disabled={to >= today} />
      </View>

      {query.isError ? <Notice tone="red">{isNetworkError(query.error) ? t('offline') : t('loadFailed')}</Notice> : null}

      <View style={styles.hero} accessible accessibilityLabel={`${t('total')}: ${formatDuration(summary.totalMinutes)}`}>
        <View style={styles.heroTop}>
          <MaterialCommunityIcons name="clock-outline" size={22} color="#BFDBFE" />
          <Text style={styles.heroLabel}>{t('total')}</Text>
          {summary.running ? (
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>{t('inProgress')}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.heroValue}>{query.isLoading ? '…' : formatDuration(summary.totalMinutes)}</Text>
        <Text style={styles.heroCaption}>{t('standard.caption', { range: standardRangeLabel() })}</Text>
        <View style={styles.heroStats}>
          <HeroStat label={t('daysWorked')} value={String(summary.daysWorked)} />
          <HeroStat label={t('average')} value={formatDuration(summary.averageMinutes)} />
          <HeroStat
            label={t('standard.met')}
            value={summary.judgedDays ? t('standard.metValue', { within: String(summary.withinDays), judged: String(summary.judgedDays) }) : '—'}
          />
        </View>
      </View>

      {summary.running ? <Notice tone="amber">{t('running')}</Notice> : null}
      {summary.missingCheckOuts > 0 ? <Notice tone="amber">{t('missing', { count: summary.missingCheckOuts })}</Notice> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('chartTitle')}</Text>
        <Chart days={summary.days} period={period} today={today} />
        <View style={styles.legend}>
          <LegendItem swatch={<View style={styles.legendBand} />} text={t('standard.legendBand', { range: standardRangeLabel() })} />
          <LegendItem swatch={<View style={[styles.legendDot, { backgroundColor: STANDARD_COLOR.WITHIN }]} />} text={t('standard.WITHIN')} />
          <LegendItem swatch={<View style={[styles.legendDot, { backgroundColor: STANDARD_COLOR.BELOW }]} />} text={t('standard.BELOW')} />
          <LegendItem swatch={<View style={[styles.legendDot, { backgroundColor: STANDARD_COLOR.ABOVE }]} />} text={t('standard.ABOVE')} />
          <LegendItem swatch={<View style={[styles.legendDot, { backgroundColor: RUNNING_COLOR }]} />} text={t('inProgress')} />
          {summary.days.some((d) => d.holiday) ? (
            <LegendItem swatch={<View style={[styles.holidayDot, { marginTop: 0 }]} />} text={t('holiday')} />
          ) : null}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('daysTitle')}</Text>
        {query.isLoading ? (
          <Text style={styles.muted}>{t('loading')}</Text>
        ) : listDays.every((d) => d.sessions.length === 0 && !d.holiday) ? (
          <Text style={styles.muted}>{t('noWork')}</Text>
        ) : (
          listDays.map((d, i) => <DayRow key={d.date} day={d} first={i === 0} today={today} />)
        )}
      </View>
    </ScrollView>
  );
}

function RoundIcon({ icon, label, onPress, disabled }: { icon: 'chevron-left' | 'chevron-right'; label: string; onPress(): void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.round, disabled ? { opacity: 0.35 } : null]}
    >
      <MaterialCommunityIcons name={icon} size={26} color={palette.text} />
    </Pressable>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatLabel} numberOfLines={2}>
        {label}
      </Text>
      <Text style={styles.heroStatValue}>{value}</Text>
    </View>
  );
}

function LegendItem({ swatch, text }: { swatch: React.ReactNode; text: string }) {
  return (
    <View style={styles.legendItem}>
      {swatch}
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

function barColor(d: HoursDay): string {
  if (d.running) return RUNNING_COLOR;
  if (d.standard) return STANDARD_COLOR[d.standard];
  return '#CBD5E1';
}

function Chart({ days, period, today }: { days: HoursDay[]; period: HoursPeriod; today: string }) {
  const { t } = useTranslation('hours');
  const max = Math.max(SCALE_FLOOR_MIN, ...days.map((d) => d.minutes));
  const y = (minutes: number) => (minutes / max) * CHART_HEIGHT;
  const week = period === 'WEEK';
  return (
    <View>
      <View style={[styles.chart, { gap: week ? 10 : 3 }]}>
        {/* Standard working day band (7–9 h) */}
        <View style={[styles.band, { bottom: y(WORKDAY_STANDARD.minMinutes), height: y(WORKDAY_STANDARD.maxMinutes) - y(WORKDAY_STANDARD.minMinutes) }]}>
          <Text style={[styles.bandLabel, { top: -16 }]}>{formatDuration(WORKDAY_STANDARD.maxMinutes)}</Text>
          <Text style={[styles.bandLabel, { bottom: -16 }]}>{formatDuration(WORKDAY_STANDARD.minMinutes)}</Text>
        </View>
        {days.map((d) => {
          const h = d.minutes > 0 ? Math.max(4, y(d.minutes)) : 0;
          return (
            <View
              key={d.date}
              style={styles.barSlot}
              accessible
              accessibilityLabel={t('chartA11y', {
                day: dayShort(d.date),
                duration: d.standard
                  ? `${formatDuration(d.minutes)}, ${t(`standard.${d.standard}`)}`
                  : d.holiday
                    ? `${formatDuration(d.minutes)}, ${t('holidayDay', { name: holidayName(d.holiday, currentLanguage()) })}`
                    : formatDuration(d.minutes),
              })}
            >
              {week && d.minutes > 0 ? <Text style={styles.barValue}>{decimalHours(d.minutes)}</Text> : null}
              <View style={[styles.bar, { height: h, borderRadius: week ? 8 : 3, backgroundColor: barColor(d) }]} />
              {d.missingCheckOut && d.minutes === 0 ? <View style={styles.missingDot} /> : null}
            </View>
          );
        })}
      </View>
      <View style={[styles.axis, { gap: week ? 10 : 3 }]}>
        {days.map((d, i) => {
          const day = Number(d.date.slice(8));
          const show = week || day === 1 || (day % 5 === 0 && days.length - i > 2);
          return (
            <View key={d.date} style={styles.axisSlot}>
              <Text style={[styles.axisLabel, d.date === today ? styles.axisToday : null, d.holiday ? styles.axisHoliday : null]} numberOfLines={1}>
                {show ? (week ? dayShort(d.date).split(' ')[0] : String(day)) : ''}
              </Text>
              {d.holiday ? <View style={styles.holidayDot} accessibilityLabel={t('holiday')} /> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function DayRow({ day, first, today }: { day: HoursDay; first: boolean; today: string }) {
  const { t } = useTranslation('hours');
  const off = day.sessions.length === 0;
  const gap = standardGap(day);
  return (
    <View style={[styles.dayRow, first ? null : styles.dayDivider]}>
      <View style={styles.dayHead}>
        <Text style={[styles.dayLabel, off ? { color: palette.textMuted } : null]}>
          {dayShort(day.date)}
          {day.date === today ? ` · ${t('now')}` : ''}
        </Text>
        {day.running ? (
          <Pill tone="blue">{t('inProgress')}</Pill>
        ) : day.missingCheckOut ? (
          <Pill tone="amber">{t('missingOut')}</Pill>
        ) : day.standard ? (
          <Pill tone={STANDARD_TONE[day.standard]}>{t(`standard.${day.standard}`)}</Pill>
        ) : day.holiday ? (
          <Pill tone="red">{t('holiday')}</Pill>
        ) : null}
      </View>

      {off ? (
        day.holiday ? (
          <View style={styles.holidayLine}>
            <MaterialCommunityIcons name="beach" size={16} color={HOLIDAY_COLOR} />
            <Text style={styles.holidayText}>{t('holidayDay', { name: holidayName(day.holiday, currentLanguage()) })}</Text>
          </View>
        ) : (
          <Text style={styles.muted}>{t('dayOff')}</Text>
        )
      ) : (
        <>
          <View style={styles.inOutRow}>
            <InOut label={t('arrived')} time={day.arrivedAt ?? '--:--'} />
            <MaterialCommunityIcons name="arrow-right" size={20} color={palette.textMuted} style={{ marginTop: 18 }} />
            <InOut label={t('left')} time={day.leftAt ?? (day.running ? t('stillIn') : '--:--')} />
            <View style={styles.dayTotalBox}>
              <Text style={[styles.dayTotal, day.standard ? { color: palette.text } : day.running ? { color: RUNNING_COLOR } : null]}>
                {formatDuration(day.minutes)}
              </Text>
            </View>
          </View>
          {day.holiday ? <Text style={styles.holidayText}>{t('holidayDay', { name: holidayName(day.holiday, currentLanguage()) })}</Text> : null}
          {gap ? <Text style={[styles.gap, { color: day.standard === 'BELOW' ? palette.amberText : '#4338CA' }]}>{gap}</Text> : null}
          {day.sessions.length > 1 ? (
            <View style={styles.sessions}>
              <Text style={styles.sessionsTitle}>{t('sessionsCount', { count: day.sessions.length })}</Text>
              {day.sessions.map((s) => (
                <View key={s.id} style={styles.sessionLine}>
                  <Text style={[styles.sessionTimes, mono]}>
                    {s.inTime} – {s.outTime ?? (s.running ? t('now') : '--:--')}
                  </Text>
                  {!s.missingCheckOut ? <Text style={styles.sessionDur}>{formatDuration(s.minutes)}</Text> : null}
                  {s.missingCheckOut ? <Pill tone="amber">{t('missingOut')}</Pill> : null}
                  {s.corrected ? <Pill tone="purple">{t('corrected')}</Pill> : null}
                </View>
              ))}
            </View>
          ) : day.sessions[0]?.corrected ? (
            <View style={{ flexDirection: 'row' }}>
              <Pill tone="purple">{t('corrected')}</Pill>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function InOut({ label, time }: { label: string; time: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.inOutLabel}>{label}</Text>
      <Text style={[styles.inOutTime, mono]}>{time}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16, paddingBottom: 32 },
  title: { fontSize: 30, fontWeight: '800', color: palette.text },
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  periodLabel: { fontSize: 17, fontWeight: '700', color: palette.text, textAlign: 'center' },
  link: { marginTop: 2, fontSize: 14, fontWeight: '600', color: palette.blue },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  hero: { backgroundColor: '#1E40AF', borderRadius: 24, padding: 20, gap: 4, elevation: 3 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#DBEAFE' },
  heroValue: { fontSize: 40, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  heroCaption: { fontSize: 13, color: '#BFDBFE' },
  heroStats: { flexDirection: 'row', gap: 8, marginTop: 12 },
  heroStat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 10, gap: 2 },
  heroStatLabel: { fontSize: 12, color: '#BFDBFE' },
  heroStatValue: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(34,197,94,0.22)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ADE80' },
  liveText: { fontSize: 12, fontWeight: '700', color: '#DCFCE7' },
  card: { backgroundColor: palette.surface, borderRadius: 20, borderWidth: 1, borderColor: palette.border, padding: 18, gap: 12 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: palette.text },
  muted: { color: palette.textMuted },
  chart: { height: CHART_HEIGHT + 24, flexDirection: 'row', alignItems: 'flex-end', paddingTop: 24 },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(34,197,94,0.10)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(22,163,74,0.45)',
  },
  bandLabel: { position: 'absolute', right: 0, fontSize: 11, color: palette.greenText },
  barSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '100%' },
  missingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.amberRing },
  barValue: { fontSize: 11, color: palette.textSoft, marginBottom: 4 },
  axis: { flexDirection: 'row', marginTop: 6 },
  axisSlot: { flex: 1, alignItems: 'center', gap: 2 },
  axisLabel: { textAlign: 'center', fontSize: 11, color: palette.textMuted },
  axisToday: { color: palette.blue, fontWeight: '700' },
  axisHoliday: { color: HOLIDAY_COLOR, fontWeight: '700' },
  holidayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: HOLIDAY_COLOR },
  holidayLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  holidayText: { flexShrink: 1, fontSize: 14, color: '#BE123C', fontWeight: '600' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendBand: { width: 18, height: 10, borderRadius: 2, backgroundColor: 'rgba(34,197,94,0.18)', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(22,163,74,0.6)' },
  legendText: { fontSize: 12, color: palette.textSoft },
  dayRow: { paddingVertical: 14, gap: 8 },
  dayDivider: { borderTopWidth: 1, borderTopColor: palette.border },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dayLabel: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: palette.text },
  inOutRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  inOutLabel: { fontSize: 12, color: palette.textMuted },
  inOutTime: { fontSize: 20, color: palette.text },
  dayTotalBox: { flex: 1, alignItems: 'flex-end', justifyContent: 'flex-end', minHeight: 44 },
  dayTotal: { fontSize: 18, fontWeight: '800', color: palette.textSoft },
  gap: { fontSize: 13, fontWeight: '600' },
  sessions: { gap: 4, backgroundColor: palette.background, borderRadius: 12, padding: 10 },
  sessionsTitle: { fontSize: 12, color: palette.textMuted },
  sessionLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  sessionTimes: { fontSize: 14, color: palette.textSoft },
  sessionDur: { fontSize: 13, color: palette.textMuted },
});
