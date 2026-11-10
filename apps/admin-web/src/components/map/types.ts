import { EARTH_RADIUS_M, LocationClass } from '@attendance/shared';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapEvidence {
  id: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  classification: LocationClass;
  label: string;
}

export interface GeofenceMapProps {
  center: LatLng;
  radiusM: number;
  evidence?: MapEvidence[];
  /** When provided the centre can be moved by clicking the map (and dragging the circle on Google Maps). */
  onCenterChange?: (c: LatLng) => void;
  /** When provided the radius can be dragged on the Google Maps circle. */
  onRadiusChange?: (r: number) => void;
  height?: number;
}

export const CLASS_COLOR: Record<LocationClass, string> = {
  [LocationClass.CONFIRMED_INSIDE]: '#16a34a',
  [LocationClass.CONFIRMED_OUTSIDE]: '#dc2626',
  [LocationClass.UNCERTAIN]: '#d97706',
};

export const GEOFENCE_COLOR = '#2563eb';

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** East/north offset in metres of `p` from `origin` (same flat approximation as the shared `distanceM`). */
export function offsetM(origin: LatLng, p: LatLng): { x: number; y: number } {
  return {
    x: EARTH_RADIUS_M * Math.cos(toRad(origin.lat)) * toRad(p.lng - origin.lng),
    y: EARTH_RADIUS_M * toRad(p.lat - origin.lat),
  };
}

/** Inverse of `offsetM`. */
export function fromOffsetM(origin: LatLng, x: number, y: number): LatLng {
  return {
    lat: origin.lat + toDeg(y / EARTH_RADIUS_M),
    lng: origin.lng + toDeg(x / (EARTH_RADIUS_M * Math.cos(toRad(origin.lat)))),
  };
}

/** Round to ~1 cm precision so form values stay readable. */
export function roundCoord(v: number): number {
  return Math.round(v * 1e7) / 1e7;
}
