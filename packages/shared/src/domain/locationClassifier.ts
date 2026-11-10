import { EARTH_RADIUS_M } from '../constants';
import { LocationClass } from '../enums';

/** The subset of a geofence configuration the classifier needs. */
export interface GeofenceParams {
  centerLat: number;
  centerLng: number;
  radiusM: number;
  maxLocationAgeSec: number;
  maxAccuracyM: number;
}

/** A single location fix used as attendance evidence. */
export interface LocationReading {
  lat: number;
  lng: number;
  /** Android `coords.accuracy`: 68% confidence radius in metres (DS2 §2.6.4 `a`). */
  accuracyM: number | null;
  /** ISO-8601 time the fix was measured. */
  measuredAt: string;
  isMock?: boolean;
}

export type UncertainReason =
  | 'MISSING_DATA'
  | 'STALE_READING'
  | 'LOW_ACCURACY'
  | 'STRADDLES_BOUNDARY';

export interface Classification {
  classification: LocationClass;
  /** Distance from the geofence centre, or null when the reading has no usable coordinates. */
  distanceM: number | null;
  /** Why the reading was classified UNCERTAIN, otherwise null. */
  uncertainReason: UncertainReason | null;
  ageSec: number | null;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Local flat-surface approximation (DS2 §2.6.2, ADR-5). Error is negligible for radii ≤ 1 km.
 *   x = R·cos(lat₀)·(lon − lon₀),  y = R·(lat − lat₀),  d = √(x² + y²)
 */
export function distanceM(cfg: Pick<GeofenceParams, 'centerLat' | 'centerLng'>, r: Pick<LocationReading, 'lat' | 'lng'>): number {
  const lat0 = toRad(cfg.centerLat);
  const lon0 = toRad(cfg.centerLng);
  const x = EARTH_RADIUS_M * Math.cos(lat0) * (toRad(r.lng) - lon0);
  const y = EARTH_RADIUS_M * (toRad(r.lat) - lat0);
  return Math.sqrt(x * x + y * y);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Classification rules (DS2 §2.6.4), r = radius, a = reported horizontal uncertainty:
 *   age > maxAge OR a > maxAccuracy OR incomplete → UNCERTAIN
 *   d + a ≤ r → CONFIRMED_INSIDE
 *   d − a > r → CONFIRMED_OUTSIDE
 *   otherwise (uncertainty circle straddles the boundary) → UNCERTAIN
 *
 * A reading timestamped in the future (beyond a small tolerance) is treated as stale: it cannot be trusted.
 */
export function classify(r: LocationReading, cfg: GeofenceParams, now: Date): Classification {
  const measured = Date.parse(r.measuredAt);
  if (!isFiniteNumber(r.lat) || !isFiniteNumber(r.lng) || Number.isNaN(measured)) {
    return { classification: LocationClass.UNCERTAIN, distanceM: null, uncertainReason: 'MISSING_DATA', ageSec: null };
  }

  const d = distanceM(cfg, r);
  const ageSec = (now.getTime() - measured) / 1000;
  const a = r.accuracyM;

  if (a == null || !isFiniteNumber(a) || a < 0) {
    return { classification: LocationClass.UNCERTAIN, distanceM: d, uncertainReason: 'MISSING_DATA', ageSec };
  }
  if (ageSec > cfg.maxLocationAgeSec || ageSec < -FUTURE_TOLERANCE_SEC) {
    return { classification: LocationClass.UNCERTAIN, distanceM: d, uncertainReason: 'STALE_READING', ageSec };
  }
  if (a > cfg.maxAccuracyM) {
    return { classification: LocationClass.UNCERTAIN, distanceM: d, uncertainReason: 'LOW_ACCURACY', ageSec };
  }
  if (d + a <= cfg.radiusM) {
    return { classification: LocationClass.CONFIRMED_INSIDE, distanceM: d, uncertainReason: null, ageSec };
  }
  if (d - a > cfg.radiusM) {
    return { classification: LocationClass.CONFIRMED_OUTSIDE, distanceM: d, uncertainReason: null, ageSec };
  }
  return { classification: LocationClass.UNCERTAIN, distanceM: d, uncertainReason: 'STRADDLES_BOUNDARY', ageSec };
}

/** Clock skew tolerated for readings that appear to be measured slightly in the future. */
export const FUTURE_TOLERANCE_SEC = 5;
