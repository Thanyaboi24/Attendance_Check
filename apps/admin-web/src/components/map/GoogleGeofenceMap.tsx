import { Fragment, useMemo } from 'react';
import { APIProvider, Circle, Map, Marker, type MapMouseEvent } from '@vis.gl/react-google-maps';
import { RADIUS_MAX_M, RADIUS_MIN_M } from '@attendance/shared';
import { fmtMetres, humanize } from '../../lib/format';
import { CLASS_COLOR, GEOFENCE_COLOR, roundCoord, type GeofenceMapProps } from './types';

/** Zoom level that fits roughly 3 radii into ~400 px at the given latitude. */
function zoomFor(radiusM: number, lat: number): number {
  const metresPerPx = (radiusM * 3) / 400;
  const z = Math.log2((156_543.03392 * Math.cos((lat * Math.PI) / 180)) / metresPerPx);
  return Math.max(3, Math.min(20, Math.floor(z)));
}

/** Google Maps JS API view (only loaded when VITE_GOOGLE_MAPS_API_KEY is set). */
export default function GoogleGeofenceMap({
  apiKey,
  center,
  radiusM,
  evidence = [],
  onCenterChange,
  onRadiusChange,
  height = 360,
}: GeofenceMapProps & { apiKey: string }) {
  // Initial camera only; the map stays uncontrolled so the admin can pan/zoom freely.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => ({ center, zoom: zoomFor(radiusM, center.lat) }), []);

  const handleMapClick = (ev: MapMouseEvent) => {
    const ll = ev.detail.latLng;
    if (onCenterChange && ll) onCenterChange({ lat: roundCoord(ll.lat), lng: roundCoord(ll.lng) });
  };

  return (
    <APIProvider apiKey={apiKey}>
      <div className="map-box" style={{ height }}>
        <Map
          defaultCenter={initial.center}
          defaultZoom={initial.zoom}
          gestureHandling="greedy"
          clickableIcons={false}
          streetViewControl={false}
          onClick={handleMapClick}
          style={{ width: '100%', height: '100%' }}
        >
          <Circle
            center={center}
            radius={radiusM}
            strokeColor={GEOFENCE_COLOR}
            strokeWeight={2}
            fillColor={GEOFENCE_COLOR}
            fillOpacity={0.12}
            draggable={!!onCenterChange}
            editable={!!onRadiusChange}
            clickable={!!onCenterChange}
            onDragEnd={(e) => {
              const ll = e.latLng;
              if (onCenterChange && ll) onCenterChange({ lat: roundCoord(ll.lat()), lng: roundCoord(ll.lng()) });
            }}
            onRadiusChanged={(r) => {
              if (!onRadiusChange) return;
              const v = Math.round(Math.min(RADIUS_MAX_M, Math.max(RADIUS_MIN_M, r)));
              if (v !== Math.round(radiusM)) onRadiusChange(v);
            }}
          />
          <Marker position={center} title="Geofence centre" />
          {evidence.map((e) => (
            <Fragment key={e.id}>
              {e.accuracyM ? (
                <Circle
                  center={{ lat: e.lat, lng: e.lng }}
                  radius={e.accuracyM}
                  strokeColor={CLASS_COLOR[e.classification]}
                  strokeOpacity={0.8}
                  strokeWeight={1}
                  fillColor={CLASS_COLOR[e.classification]}
                  fillOpacity={0.15}
                  clickable={false}
                />
              ) : null}
              <Marker
                position={{ lat: e.lat, lng: e.lng }}
                title={`${e.label}: ${humanize(e.classification)}, accuracy ${fmtMetres(e.accuracyM)}`}
                icon={{
                  path: 0, // google.maps.SymbolPath.CIRCLE
                  scale: 6,
                  fillColor: CLASS_COLOR[e.classification],
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 2,
                }}
              />
            </Fragment>
          ))}
        </Map>
      </div>
      {onCenterChange || onRadiusChange ? (
        <div className="map-note">Click the map or drag the circle to move the centre; drag the circle edge to resize.</div>
      ) : null}
    </APIProvider>
  );
}
