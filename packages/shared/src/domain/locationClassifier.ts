import { EARTH_RADIUS_M } from '../constants';
import { LocationClass } from '../enums';

/** One circular area. */
export interface ZoneParams {
  name?: string;
  centerLat: number;
  centerLng: number;
  radiusM: number;
}

/**
 * The subset of a geofence configuration the classifier needs. When `zones` is present and non-empty
 * it is authoritative; otherwise the top-level centre/radius is the single area.
 */
export interface GeofenceParams extends ZoneParams {
  zones?: readonly ZoneParams[] | null;
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
  /** Distance from the centre of `zone`, or null when the reading has no usable coordinates. */
  distanceM: number | null;
  /**
   * Only for configurations with several areas: the area the reading was matched to (inside), straddles,
   * or is closest to (outside). Distance and radius shown to people refer to this area.
   */
  zone?: string;
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
 * (with several areas: inside if inside any area, outside only if outside all of them)
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

  const zones = cfg.zones && cfg.zones.length > 0 ? cfg.zones : [cfg];
  const multi = zones.length > 1;
  const result = (classification: LocationClass, zone: ZoneParams, d: number, uncertainReason: UncertainReason | null): Classification => ({
    classification,
    distanceM: d,
    uncertainReason,
    ageSec,
    ...(multi ? { zone: zone.name ?? '' } : {}),
  });

  // Distances to every area; the nearest edge decides which area a non-inside reading is reported against.
  const measuredZones = zones.map((z) => ({ z, d: distanceM(z, r) }));
  const nearest = measuredZones.reduce((best, m) => (m.d - m.z.radiusM < best.d - best.z.radiusM ? m : best));
  const ageSec = (now.getTime() - measured) / 1000;
  const a = r.accuracyM;

  if (a == null || !isFiniteNumber(a) || a < 0) return result(LocationClass.UNCERTAIN, nearest.z, nearest.d, 'MISSING_DATA');
  if (ageSec > cfg.maxLocationAgeSec || ageSec < -FUTURE_TOLERANCE_SEC) {
    return result(LocationClass.UNCERTAIN, nearest.z, nearest.d, 'STALE_READING');
  }
  if (a > cfg.maxAccuracyM) return result(LocationClass.UNCERTAIN, nearest.z, nearest.d, 'LOW_ACCURACY');

  // Inside: the whole uncertainty circle fits in at least one area.
  const inside = measuredZones.find((m) => m.d + a <= m.z.radiusM);
  if (inside) return result(LocationClass.CONFIRMED_INSIDE, inside.z, inside.d, null);
  // Outside: the uncertainty circle is clear of every area.
  if (measuredZones.every((m) => m.d - a > m.z.radiusM)) return result(LocationClass.CONFIRMED_OUTSIDE, nearest.z, nearest.d, null);
  // Otherwise it straddles the boundary of at least one area.
  const straddled = measuredZones.find((m) => m.d - a <= m.z.radiusM) ?? nearest;
  return result(LocationClass.UNCERTAIN, straddled.z, straddled.d, 'STRADDLES_BOUNDARY');
}

/** Clock skew tolerated for readings that appear to be measured slightly in the future. */
export const FUTURE_TOLERANCE_SEC = 5;
