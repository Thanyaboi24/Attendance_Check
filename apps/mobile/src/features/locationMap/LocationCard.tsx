import { type GeofenceConfig, type LocationClass, zonesOf } from '@attendance/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text } from 'react-native-paper';
import { locationColors, palette } from '../../app/theme';
import type { LastFix } from '../../store/appStore';
import { describeFix, distanceBar, locationShort, relativeAge, shortArea, zoneForFix } from './locationModel';

/** Inside / Outside / Uncertain pill (pages 3–5). */
export function LocationPill({ cls }: { cls: LocationClass }) {
  const { t } = useTranslation('location');
  const bg = cls === 'CONFIRMED_INSIDE' ? palette.greenSoft : cls === 'UNCERTAIN' ? palette.amberSoft : palette.graySoft;
  const fg = cls === 'CONFIRMED_INSIDE' ? palette.greenText : cls === 'UNCERTAIN' ? palette.amberText : palette.textSoft;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]} accessibilityLabel={t('card.pillA11y', { status: locationShort(cls) })}>
      <Text style={[styles.pillText, { color: fg }]}>{locationShort(cls)}</Text>
    </View>
  );
}

/** Centre → boundary bar with the accuracy band and the reading's position (page 4). */
export function DistanceBarView({ fix, radiusM }: { fix: LastFix; radiusM: number }) {
  const { t } = useTranslation('location');
  if (fix.distanceM == null) return null;
  const bar = distanceBar(fix.distanceM, fix.accuracyM, radiusM);
  const band = locationColors[fix.classification];
  const pct = (f: number) => `${(f * 100).toFixed(2)}%` as const;
  return (
    <View accessibilityLabel={t('card.barA11y', { distance: String(Math.round(fix.distanceM)), radius: String(radiusM) })}>
      <View style={styles.track}>
        <View style={[styles.segment, { left: 0, width: pct(bar.boundary), backgroundColor: palette.barInside }]} />
        <View style={[styles.segment, { left: pct(bar.boundary), right: 0, backgroundColor: palette.barOutside }]} />
        <View style={[styles.band, { left: pct(bar.bandStart), width: pct(Math.max(0.01, bar.bandEnd - bar.bandStart)), backgroundColor: `${band}66` }]} />
        <View style={[styles.tick, { left: pct(bar.marker) }]} />
      </View>
      <View style={styles.barLabels}>
        <Text style={styles.small}>{t('card.centre')}</Text>
        <Text style={[styles.small, styles.boundaryLabel, { left: pct(bar.boundary) }]} numberOfLines={1}>
          {t('card.boundary', { radius: String(radiusM) })}
        </Text>
      </View>
    </View>
  );
}

interface LocationCardProps {
  cfg: GeofenceConfig | null;
  fix: LastFix | null;
  /** Detailed variant (sentence + bar) while a request is pending; compact row otherwise (page 3). */
  detailed: boolean;
  note?: string | null;
  busy?: boolean;
  error?: string | null;
  now: Date;
  onMap(): void;
  onRefresh(): void;
}

/** Location card. Location status is shown apart from attendance status (design principle "Location ≠ Attendance"). */
export function LocationCard({ cfg, fix, detailed, note, busy, error, now, onMap, onRefresh }: LocationCardProps) {
  const { t } = useTranslation('location');
  const zone = cfg ? zoneForFix(cfg, fix) : null;
  const multiArea = !!cfg && zonesOf(cfg).length > 1;
  const updated = fix
    ? `${t('card.updated', { age: relativeAge(fix.measuredAt, now) })}${fix.accuracyM != null ? t('card.accuracySuffix', { accuracy: String(Math.round(fix.accuracyM)) }) : ''}`
    : null;

  if (!detailed) {
    return (
      <View style={[styles.card, styles.row]}>
        <View style={styles.iconBox}>
          <MaterialCommunityIcons name="map-marker-outline" size={26} color={palette.blue} />
        </View>
        <Pressable style={{ flex: 1 }} onPress={onRefresh} accessibilityRole="button" accessibilityHint={t('card.refreshHint')}>
          <Text style={styles.muted}>{t('card.label')}</Text>
          <Text style={styles.headline}>
            {fix
              ? `${locationShort(fix.classification)}${
                  fix.distanceM == null
                    ? ''
                    : multiArea && zone
                      ? t('card.compactDistanceArea', { distance: String(Math.round(fix.distanceM)), area: shortArea(zone.name) })
                      : t('card.compactDistance', { distance: String(Math.round(fix.distanceM)) })
                }`
              : t('card.notChecked')}
          </Text>
          <Text style={styles.small}>{busy ? t('card.checking') : (error ?? updated ?? t('card.tapToCheck'))}</Text>
        </Pressable>
        <Pressable onPress={onMap} accessibilityRole="link" hitSlop={12}>
          <Text style={styles.link}>{t('card.map')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.card, { gap: 12 }]}>
      <View style={styles.rowBetween}>
        <Text style={styles.label}>{t('card.label')}</Text>
        <View style={styles.row}>
          {busy ? <ActivityIndicator size={14} /> : null}
          {fix ? <LocationPill cls={fix.classification} /> : null}
        </View>
      </View>
      <Text style={styles.body}>{fix && zone ? describeFix(fix, zone.radiusM, multiArea ? zone.name : undefined) : t('card.notCheckedLong')}</Text>
      {fix && zone ? <DistanceBarView fix={fix} radiusM={zone.radiusM} /> : null}
      {note ? <Text style={styles.small}>{note}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.rowBetween}>
        <Text style={[styles.small, { flexShrink: 1 }]}>{updated ?? ''}</Text>
        <View style={[styles.row, { gap: 18 }]}>
          <Pressable onPress={onRefresh} accessibilityRole="button" hitSlop={12} disabled={busy}>
            <Text style={styles.link}>{t('card.refresh')}</Text>
          </Pressable>
          <Pressable onPress={onMap} accessibilityRole="link" hitSlop={12}>
            <Text style={styles.link}>{t('card.map')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.surface, borderRadius: 20, borderWidth: 1, borderColor: palette.border, padding: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  iconBox: { width: 52, height: 52, borderRadius: 14, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '600', color: palette.textSoft },
  muted: { fontSize: 14, color: palette.textMuted },
  headline: { fontSize: 17, fontWeight: '700', color: palette.text },
  body: { fontSize: 16, lineHeight: 23, color: palette.text },
  small: { fontSize: 13, color: palette.textMuted },
  error: { fontSize: 13, color: '#DC2626' },
  link: { fontSize: 15, fontWeight: '600', color: palette.blue },
  pill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 14, fontWeight: '600' },
  track: { height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: palette.barOutside, marginTop: 4 },
  segment: { position: 'absolute', top: 0, bottom: 0 },
  band: { position: 'absolute', top: 0, bottom: 0, borderRadius: 6 },
  tick: { position: 'absolute', top: -2, bottom: -2, width: 2, marginLeft: -1, backgroundColor: palette.marker },
  barLabels: { height: 20, marginTop: 6 },
  boundaryLabel: { position: 'absolute', transform: [{ translateX: -110 }], width: 110, textAlign: 'right' },
});
