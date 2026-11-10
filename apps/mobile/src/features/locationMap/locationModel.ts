import { formatBangkokTime, type GeofenceConfig, type LocationClass, RequestType } from '@attendance/shared';

/** Mockup page 5 sheet title and page 3/4 badge text for each location class. */
export const LOCATION_TITLE: Record<LocationClass, string> = {
  CONFIRMED_INSIDE: 'Confirmed inside',
  CONFIRMED_OUTSIDE: 'Outside the area',
  UNCERTAIN: 'Location uncertain',
};

export const LOCATION_SHORT: Record<LocationClass, string> = {
  CONFIRMED_INSIDE: 'Inside',
  CONFIRMED_OUTSIDE: 'Outside',
  UNCERTAIN: 'Uncertain',
};

export interface FixLike {
  accuracyM: number | null;
  distanceM: number | null;
  classification: LocationClass;
  measuredAt: string;
}

/** "Updated 2 min ago" (page 3). Coarse on purpose: the reading is display-only. */
export function relativeAge(iso: string, now: Date): string {
  const sec = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000));
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  return `at ${formatBangkokTime(iso)}`;
}

/** "08:44:10" in Asia/Bangkok (fixed UTC+7, no DST), for the map footer. */
export function bangkokClock(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(11, 19);
}

/** Sentence under the badge (page 4): distance, accuracy and what it means relative to the boundary. */
export function describeFix(fix: FixLike, radiusM: number): string {
  const d = fix.distanceM != null ? `${Math.round(fix.distanceM)} m from centre` : 'Distance unknown';
  const acc = fix.accuracyM != null ? `, accuracy ±${Math.round(fix.accuracyM)} m` : '';
  switch (fix.classification) {
    case 'CONFIRMED_INSIDE':
      return `${d}${acc}. You are inside the ${radiusM} m area.`;
    case 'CONFIRMED_OUTSIDE':
      return `${d}${acc}. You are outside the ${radiusM} m area.`;
    case 'UNCERTAIN':
      return `${d}${acc}. You are close to the edge of the ${radiusM} m area.`;
  }
}

/**
 * Geometry of the centre→boundary bar (page 4), as fractions of the track width.
 * The track spans 0 … 1.25 × radius so a reading just outside the boundary is still visible.
 */
export interface DistanceBar {
  /** Where the boundary tick sits. */
  boundary: number;
  /** The reading's distance (marker). Clamped to the track. */
  marker: number;
  /** Accuracy band [distance − accuracy, distance + accuracy], clamped. */
  bandStart: number;
  bandEnd: number;
}

export const BAR_SPAN = 1.25;

export function distanceBar(distanceM: number, accuracyM: number | null, radiusM: number): DistanceBar {
  const max = radiusM * BAR_SPAN;
  const f = (m: number) => Math.min(1, Math.max(0, m / max));
  const acc = accuracyM ?? 0;
  return { boundary: f(radiusM), marker: f(distanceM), bandStart: f(distanceM - acc), bandEnd: f(distanceM + acc) };
}

/** The side the fix must be confirmed on for automatic attendance of this request type. */
export function requiredClass(type: RequestType): LocationClass {
  return type === RequestType.CHECK_IN ? 'CONFIRMED_INSIDE' : 'CONFIRMED_OUTSIDE';
}

/** Footnote under the location card while a request is pending, e.g. "Automatic check-in needs a confirmed inside reading." */
export function autoRequirementNote(type: RequestType, cls: LocationClass | null): string | null {
  const need = requiredClass(type);
  if (cls === need) return null;
  return type === RequestType.CHECK_IN
    ? 'Automatic check-in needs a confirmed inside reading.'
    : 'Automatic check-out needs a confirmed outside reading.';
}

export interface Countdown {
  /** Remaining whole seconds (0 once the deadline has passed). */
  remainingSec: number;
  /** "3:12" */
  label: string;
  /** Remaining share of the grace period, 1 → 0, for the ring. */
  fraction: number;
  expired: boolean;
}

/** Countdown ring (page 4). The grace period starts when the notification was posted (fallback: detection). */
export function countdown(startIso: string, deadlineIso: string, now: Date): Countdown {
  const start = Date.parse(startIso);
  const end = Date.parse(deadlineIso);
  const remainingMs = Math.max(0, end - now.getTime());
  const total = Math.max(1, end - start);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const m = Math.floor(remainingSec / 60);
  const s = remainingSec % 60;
  return {
    remainingSec,
    label: `${m}:${String(s).padStart(2, '0')}`,
    fraction: Math.min(1, remainingMs / total),
    expired: remainingMs <= 0,
  };
}

/** Short, stable reference shown as "Request #a7f3". */
export function shortRequestId(requestId: string): string {
  return requestId.replace(/-/g, '').slice(0, 4);
}

/** Initial camera: centre of the area, zoomed so the whole circle (and some context) fits. */
export function regionFor(cfg: Pick<GeofenceConfig, 'centerLat' | 'centerLng' | 'radiusM'>) {
  const latDelta = (cfg.radiusM * 2 * 1.6) / 111_320;
  const lngDelta = latDelta / Math.cos((cfg.centerLat * Math.PI) / 180);
  return { latitude: cfg.centerLat, longitude: cfg.centerLng, latitudeDelta: latDelta, longitudeDelta: lngDelta };
}
