import { classify, LOCATION_POLICY, zonesOf } from '@attendance/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type MapView from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { locationColors, palette } from '../../app/theme';
import { uncertainReasonText } from '../../domain/displayStatus';
import { toReading } from '../../services/location/getFreshLocation';
import { type LastFix, useAppStore } from '../../store/appStore';
import { GOOGLE_MAPS_CONFIGURED } from '../../utils/env';
import { GeofenceMap } from './GeofenceMap';
import { LocationPill } from './LocationCard';
import { bangkokClock, locationTitle, regionFor, zoneForFix } from './locationModel';
import { useDisplayFix } from './useDisplayFix';

const SHEET_HEIGHT = 330;

function RoundButton({ icon, label, onPress, busy }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; onPress(): void; busy?: boolean }) {
  return (
    <Pressable style={styles.roundButton} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} disabled={busy}>
      {busy ? <ActivityIndicator size={20} /> : <MaterialCommunityIcons name={icon} size={28} color={palette.text} />}
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

/**
 * Location map (mockup page 5, design §16.4). watchPositionAsync (High, 5 s) runs ONLY while this screen is
 * focused and is removed on blur. Positions stay on the phone (never uploaded). Without a Google Maps key the
 * sheet is shown on its own with the coordinates as text.
 */
export function LocationMapScreen() {
  const { t } = useTranslation('location');
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const cfg = useAppStore((s) => s.dashboard?.config ?? null);
  const fix = useAppStore((s) => s.lastFix);
  const mapRef = useRef<MapView>(null);
  const loc = useDisplayFix(cfg);
  const setLocError = loc.setError;
  const [mapFailed, setMapFailed] = useState(false);

  const update = useCallback(
    (l: Location.LocationObject) => {
      if (!cfg) return;
      const reading = toReading(l);
      const c = classify(reading, cfg, new Date());
      const next: LastFix = {
        ...reading,
        isMock: reading.isMock ?? false,
        classification: c.classification,
        distanceM: c.distanceM,
        uncertainReason: c.uncertainReason,
        zone: c.zone,
      };
      useAppStore.getState().setLastFix(next);
    },
    [cfg],
  );

  useFocusEffect(
    useCallback(() => {
      let sub: Location.LocationSubscription | null = null;
      let cancelled = false;
      (async () => {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted) {
          setLocError(t('map.permissionMissing'));
          return;
        }
        // Last known position only positions the camera; it is never used as evidence (design §16.3).
        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        if (last && !cancelled) update(last);
        const s = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: LOCATION_POLICY.mapWatchIntervalMs, distanceInterval: 0 },
          (l) => update(l),
          (reason) => setLocError(reason),
        );
        if (cancelled) s.remove();
        else sub = s;
      })().catch((e: unknown) => setLocError(e instanceof Error ? e.message : String(e)));
      return () => {
        cancelled = true;
        sub?.remove();
      };
    }, [update, setLocError, t]),
  );

  function recenter() {
    if (!cfg) return;
    const area = regionFor(zoneForFix(cfg, fix));
    if (fix) mapRef.current?.animateToRegion({ ...area, latitude: fix.lat, longitude: fix.lng }, 400);
    else mapRef.current?.animateToRegion(area, 400);
  }

  const back = (
    <View style={[styles.topLeft, { top: insets.top + 12 }]}>
      <RoundButton icon="chevron-left" label={t('map.back')} onPress={() => navigation.goBack()} />
    </View>
  );

  if (!cfg) {
    return (
      <View style={[styles.screen, styles.pad, { paddingTop: insets.top + 84 }]}>
        {back}
        <Text>{t('map.notLoaded')}</Text>
      </View>
    );
  }

  const showMap = GOOGLE_MAPS_CONFIGURED && !mapFailed;
  const cls = fix?.classification ?? null;
  const zones = zonesOf(cfg);
  const zone = zoneForFix(cfg, fix);

  return (
    <View style={styles.screen}>
      {showMap ? (
        <MapErrorBoundary onError={() => setMapFailed(true)}>
          <GeofenceMap ref={mapRef} cfg={cfg} reading={fix} cls={cls} topInset={insets.top} bottomInset={SHEET_HEIGHT - 24} />
        </MapErrorBoundary>
      ) : (
        <View style={[styles.noMap, { paddingTop: insets.top + 84, paddingBottom: SHEET_HEIGHT }]}>
          <MaterialCommunityIcons name="map-marker-radius-outline" size={56} color={palette.textMuted} />
          <Text style={styles.noMapText}>
            {GOOGLE_MAPS_CONFIGURED ? t('map.unavailable', { version: String(cfg.version) }) : t('map.unavailableNoKey', { version: String(cfg.version) })}
            {zones
              .map((z) => `\n${t('map.zoneLine', { name: z.name, lat: z.centerLat.toFixed(5), lng: z.centerLng.toFixed(5), radius: String(z.radiusM) })}`)
              .join('')}
            {fix ? `\n${t('map.you', { lat: fix.lat.toFixed(5), lng: fix.lng.toFixed(5) })}` : ''}
          </Text>
        </View>
      )}

      {back}
      <View style={[styles.topRight, { top: insets.top + 12 }]}>
        {showMap ? <RoundButton icon="crosshairs" label={t('map.recenter')} onPress={recenter} /> : null}
        <RoundButton icon="refresh" label={t('map.refreshLocation')} onPress={() => void loc.refresh()} busy={loc.busy} />
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.handle} />
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>{cls ? locationTitle(cls) : t('map.waiting')}</Text>
            {zones.length > 1 && fix ? (
              <Text style={styles.areaName}>{cls === 'CONFIRMED_INSIDE' ? zone.name : t('map.nearest', { area: zone.name })}</Text>
            ) : null}
          </View>
          {cls ? <LocationPill cls={cls} /> : null}
        </View>
        <View style={styles.stats}>
          <Stat label={t('map.distance')} value={fix?.distanceM != null ? t('map.metres', { value: String(Math.round(fix.distanceM)) }) : '—'} />
          <Stat label={t('map.accuracy')} value={fix?.accuracyM != null ? t('map.plusMinusMetres', { value: String(Math.round(fix.accuracyM)) }) : '—'} />
          <Stat label={t('map.radius')} value={t('map.metres', { value: String(zone.radiusM) })} />
        </View>
        {cls === 'UNCERTAIN' ? <Text style={styles.reason}>{uncertainReasonText(fix?.uncertainReason)}</Text> : null}
        {fix?.isMock ? <Text style={styles.error}>{t('map.mock')}</Text> : null}
        {loc.error ? <Text style={styles.error}>{loc.error}</Text> : null}
        <View style={{ gap: 8 }}>
          <Legend color={locationColors.CONFIRMED_INSIDE} text={t('map.legendInside')} />
          <Legend color={locationColors.UNCERTAIN} text={t('map.legendUncertain')} />
          <Legend color={locationColors.CONFIRMED_OUTSIDE} text={t('map.legendOutside')} />
        </View>
        <Text style={styles.footer}>
          {fix ? t('map.updatedAt', { time: bangkokClock(fix.measuredAt) }) : ''}
          {t('map.privacy')}
        </Text>
      </View>
    </View>
  );
}

class MapErrorBoundary extends React.Component<{ onError: () => void; children: React.ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onError();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  pad: { padding: 16 },
  topLeft: { position: 'absolute', left: 16 },
  topRight: { position: 'absolute', right: 16, gap: 12 },
  roundButton: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  noMap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  noMapText: { textAlign: 'center', color: palette.textSoft, lineHeight: 21 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: SHEET_HEIGHT,
    backgroundColor: palette.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 14,
    elevation: 12,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#CBD5E1' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sheetTitle: { fontSize: 24, fontWeight: '800', color: palette.text },
  areaName: { fontSize: 15, fontWeight: '600', color: palette.textSoft, marginTop: 2 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: palette.background, borderRadius: 14, padding: 12, gap: 2 },
  statLabel: { fontSize: 13, color: palette.textMuted },
  statValue: { fontSize: 18, fontFamily: 'monospace', color: palette.text },
  reason: { fontSize: 14, color: palette.amberText },
  error: { fontSize: 13, color: '#DC2626' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  legendDot: { width: 14, height: 14, borderRadius: 7 },
  legendText: { flex: 1, fontSize: 15, color: palette.textSoft },
  footer: { fontSize: 13, color: palette.textMuted },
});
