import type { HolidayDto } from '@attendance/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { holidayName } from '../../domain/holidays';
import { dayLong } from '../../i18n/format';

const ROSE = { bg: '#FFF1F2', border: '#FDA4AF', icon: '#FFE4E6', strong: '#BE123C', text: '#881337', soft: '#9F1239' };

/** Home card on a holiday: no need to come in, check-in is closed (check-out still works). */
export function HolidayBanner({ holiday, onCalendar }: { holiday: HolidayDto; onCalendar(): void }) {
  const { t, i18n } = useTranslation('dashboard');
  const { t: tc } = useTranslation('calendar');
  const name = holidayName(holiday, i18n.language === 'th' ? 'th' : 'en');
  return (
    <View style={styles.card} accessible accessibilityLabel={t('holiday.a11y', { name })}>
      <View style={styles.top}>
        <View style={styles.iconBox}>
          <MaterialCommunityIcons name="beach" size={30} color={ROSE.strong} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.kicker}>
            {t('holiday.kicker')} · {tc(`type.${holiday.type}`)}
          </Text>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.date}>{dayLong(holiday.date)}</Text>
        </View>
      </View>
      <Text style={styles.title}>{t('holiday.title')}</Text>
      <Text style={styles.body}>{t('holiday.body')}</Text>
      {holiday.note ? <Text style={styles.note}>{holiday.note}</Text> : null}
      <View style={styles.footer}>
        <View style={styles.lockPill}>
          <MaterialCommunityIcons name="lock" size={16} color={ROSE.strong} />
          <Text style={styles.lockText}>{t('holiday.locked')}</Text>
        </View>
        <Pressable onPress={onCalendar} accessibilityRole="button" hitSlop={8} style={styles.link}>
          <MaterialCommunityIcons name="calendar-month-outline" size={18} color={ROSE.strong} />
          <Text style={styles.linkText}>{t('holiday.calendar')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: ROSE.bg, borderRadius: 20, borderWidth: 1.5, borderColor: ROSE.border, padding: 18, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconBox: { width: 56, height: 56, borderRadius: 16, backgroundColor: ROSE.icon, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 13, fontWeight: '700', color: ROSE.strong, textTransform: 'uppercase', letterSpacing: 0.4 },
  name: { fontSize: 20, fontWeight: '800', color: ROSE.text },
  date: { fontSize: 13, color: ROSE.soft },
  title: { fontSize: 17, fontWeight: '700', color: ROSE.text },
  body: { fontSize: 14, lineHeight: 20, color: ROSE.soft },
  note: { fontSize: 13, lineHeight: 19, color: ROSE.soft, fontStyle: 'italic' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  lockPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFE4E6', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  lockText: { fontSize: 13, fontWeight: '700', color: ROSE.strong },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { fontSize: 14, fontWeight: '700', color: ROSE.strong },
});
