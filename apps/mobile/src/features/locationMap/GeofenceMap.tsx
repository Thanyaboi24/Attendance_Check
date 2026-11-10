import type { GeofenceConfig, LocationClass } from '@attendance/shared';
import React, { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { locationColors, palette } from '../../app/theme';
import { regionFor } from './locationModel';

export interface MapReading {
  lat: number;
  lng: number;
  accuracyM: number | null;
}

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Round dot with a white ring, like the mockup's centre and "you" markers. */
function Dot({ color, size }: { color: string; size: number }) {
  return <View style={[styles.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]} />;
}

/**
 * Mockup page 5 / design §16.4 (Google Maps via react-native-maps): geofence circle (blue) + centre dot, and the
 * user's dot + accuracy circle coloured by the classification (green inside, orange uncertain, grey outside).
 * Display only: never used for decisions.
 */
export const GeofenceMap = forwardRef<
  MapView,
  { cfg: GeofenceConfig; reading: MapReading | null; cls: LocationClass | null; topInset?: number; bottomInset?: number }
>(function GeofenceMap({ cfg, reading, cls, topInset = 0, bottomInset = 0 }, ref) {
  const center = { latitude: cfg.centerLat, longitude: cfg.centerLng };
  const color = locationColors[cls ?? 'UNCERTAIN'];
  return (
    <MapView
      ref={ref}
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFill}
      initialRegion={regionFor(cfg)}
      mapPadding={{ top: topInset, bottom: bottomInset, left: 0, right: 0 }}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
      toolbarEnabled={false}
    >
      <Circle center={center} radius={cfg.radiusM} strokeColor={palette.blue} strokeWidth={3} fillColor="rgba(37,99,235,0.14)" />
      <Marker coordinate={center} anchor={{ x: 0.5, y: 0.5 }} title={cfg.name} description={`Radius ${cfg.radiusM} m · v${cfg.version}`} tracksViewChanges={false}>
        <Dot color={palette.blue} size={22} />
      </Marker>
      {reading ? (
        <>
          {reading.accuracyM ? (
            <Circle
              center={{ latitude: reading.lat, longitude: reading.lng }}
              radius={reading.accuracyM}
              strokeColor={color}
              strokeWidth={2}
              fillColor={withAlpha(color, 0.25)}
            />
          ) : null}
          {/* Re-keyed on colour so the bitmap is redrawn when the classification changes. */}
          <Marker key={color} coordinate={{ latitude: reading.lat, longitude: reading.lng }} anchor={{ x: 0.5, y: 0.5 }} title="You" tracksViewChanges={false}>
            <Dot color={color} size={24} />
          </Marker>
        </>
      ) : null}
    </MapView>
  );
});

const styles = StyleSheet.create({
  dot: { borderWidth: 4, borderColor: '#FFFFFF', elevation: 3 },
});
