import { classify, LOCATION_POLICY } from '@attendance/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type MapView from 'react-native-maps';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { locationColors, palette } from '../../app/theme';
import { uncertainReasonText } from '../../domain/displayStatus';
import { toReading } from '../../services/location/getFreshLocation';
import { type LastFix, useAppStore } from '../../store/appStore';
import { GOOGLE_MAPS_CONFIGURED } from '../../utils/env';
import { GeofenceMap } from './GeofenceMap';
import { LocationPill } from './LocationCard';
import { bangkokClock, LOCATION_TITLE, regionFor } from './locationModel';
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
          setLocError('Location permission is not granted.');
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
    }, [update, setLocError]),
  );

  function recenter() {
    if (!cfg) return;
    if (fix) mapRef.current?.animateToRegion({ ...regionFor(cfg), latitude: fix.lat, longitude: fix.lng }, 400);
    else mapRef.current?.animateToRegion(regionFor(cfg), 400);
  }

  const back = (
    <View style={[styles.topLeft, { top: insets.top + 12 }]}>
      <RoundButton icon="chevron-left" label="Back" onPress={() => navigation.goBack()} />
    </View>
  );

  if (!cfg) {
    return (
      <View style={[styles.screen, styles.pad, { paddingTop: insets.top + 84 }]}>
        {back}
        <Text>The attendance area has not been loaded yet. Connect to the internet and pull to refresh on the dashboard.</Text>
      </View>
    );
  }

  const showMap = GOOGLE_MAPS_CONFIGURED && !mapFailed;
  const cls = fix?.classification ?? null;

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
            Map unavailable{GOOGLE_MAPS_CONFIGURED ? '' : ' (no Google Maps key in this build)'}.{'\n'}Area “{cfg.name}”: centre {cfg.centerLat.toFixed(5)},{' '}
            {cfg.centerLng.toFixed(5)}, radius {cfg.radiusM} m, version {cfg.version}.
            {fix ? `\nYou: ${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}` : ''}
          </Text>
        </View>
      )}

      {back}
      <View style={[styles.topRight, { top: insets.top + 12 }]}>
        {showMap ? <RoundButton icon="crosshairs" label="Re-center" onPress={recenter} /> : null}
        <RoundButton icon="refresh" label="Refresh location" onPress={() => void loc.refresh()} busy={loc.busy} />
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.handle} />
        <View style={styles.rowBetween}>
          <Text style={styles.sheetTitle}>{cls ? LOCATION_TITLE[cls] : 'Waiting for a location fix…'}</Text>
          {cls ? <LocationPill cls={cls} /> : null}
        </View>
        <View style={styles.stats}>
          <Stat label="Distance" value={fix?.distanceM != null ? `${Math.round(fix.distanceM)} m` : '—'} />
          <Stat label="Accuracy" value={fix?.accuracyM != null ? `±${Math.round(fix.accuracyM)} m` : '—'} />
          <Stat label="Radius" value={`${cfg.radiusM} m`} />
        </View>
        {cls === 'UNCERTAIN' ? <Text style={styles.reason}>{uncertainReasonText(fix?.uncertainReason)}</Text> : null}
        {fix?.isMock ? <Text style={styles.error}>Mock location detected. Readings like this are rejected by the server.</Text> : null}
        {loc.error ? <Text style={styles.error}>{loc.error}</Text> : null}
        <View style={{ gap: 8 }}>
          <Legend color={locationColors.CONFIRMED_INSIDE} text="Green: accuracy circle fully inside" />
          <Legend color={locationColors.UNCERTAIN} text="Orange: accuracy circle crosses the boundary" />
          <Legend color={locationColors.CONFIRMED_OUTSIDE} text="Grey: fully outside" />
        </View>
        <Text style={styles.footer}>
          {fix ? `Updated ${bangkokClock(fix.measuredAt)} · ` : ''}Shown on this phone only, never uploaded.
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
  sheetTitle: { flex: 1, fontSize: 24, fontWeight: '800', color: palette.text },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: palette.background, borderRadius: 14, padding: 12, gap: 2 },
  statLabel: { fontSize: 13, color: palette.textMuted },
  statValue: { fontSize: 20, fontFamily: 'monospace', color: palette.text },
  reason: { fontSize: 14, color: palette.amberText },
  error: { fontSize: 13, color: '#DC2626' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  legendDot: { width: 14, height: 14, borderRadius: 7 },
  legendText: { fontSize: 15, color: palette.textSoft },
  footer: { fontSize: 13, color: palette.textMuted },
});
