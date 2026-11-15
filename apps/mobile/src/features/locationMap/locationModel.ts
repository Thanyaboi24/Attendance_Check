import { formatBangkokTime, type GeofenceConfig, type GeofenceZone, type LocationClass, RequestType, zonesOf } from '@attendance/shared';
import { t } from '../../i18n';

/** Mockup page 5 sheet title for each location class (current language). */
export function locationTitle(cls: LocationClass): string {
  return t(`location:title.${cls}`);
}

/** Page 3/4 badge text for each location class (current language). */
export function locationShort(cls: LocationClass): string {
  return t(`location:short.${cls}`);
}

export interface FixLike {
  accuracyM: number | null;
  distanceM: number | null;
  classification: LocationClass;
  measuredAt: string;
  /** Area the fix was matched to when the configuration has several (campuses). */
  zone?: string;
}

/** "SIIT Bangkadi campus" → "Bangkadi", for tight one-line labels. */
export function shortArea(name: string): string {
  return name.replace(/^SIIT\s+/i, '').replace(/\s+campus$/i, '').trim() || name;
}

/** The area a fix refers to: the one named by the classification, else the first (or only) area. */
export function zoneForFix(cfg: GeofenceConfig, fix: Pick<FixLike, 'zone'> | null): GeofenceZone {
  const zones = zonesOf(cfg);
  return zones.find((z) => z.name === fix?.zone) ?? zones[0]!;
}

/** "Updated 2 min ago" (page 3). Coarse on purpose: the reading is display-only. */
export function relativeAge(iso: string, now: Date): string {
  const sec = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000));
  if (sec < 45) return t('location:age.justNow');
  const min = Math.round(sec / 60);
  if (min < 60) return t('location:age.minutes', { min: String(min) });
  return t('location:age.at', { time: formatBangkokTime(iso) });
}

/** "08:44:10" in Asia/Bangkok (fixed UTC+7, no DST), for the map footer. */
export function bangkokClock(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(11, 19);
}

/** Sentence under the badge (page 4): distance, accuracy and what it means relative to the boundary. */
export function describeFix(fix: FixLike, radiusM: number, areaName?: string): string {
  const distance = fix.distanceM != null ? String(Math.round(fix.distanceM)) : null;
  const d =
    distance == null
      ? t('location:fix.distanceUnknown')
      : areaName
        ? t('location:fix.distanceArea', { distance, area: areaName })
        : t('location:fix.distance', { distance });
  const acc = fix.accuracyM != null ? t('location:fix.accuracy', { accuracy: String(Math.round(fix.accuracyM)) }) : '';
  const reading = `${d}${acc}`;
  const area = areaName ? t('location:fix.areaNamed', { area: areaName, radius: String(radiusM) }) : t('location:fix.area', { radius: String(radiusM) });
  switch (fix.classification) {
    case 'CONFIRMED_INSIDE':
      return t('location:fix.inside', { reading, area });
    case 'CONFIRMED_OUTSIDE':
      return areaName ? t('location:fix.outsideAll', { reading, area }) : t('location:fix.outside', { reading, area });
    case 'UNCERTAIN':
      return t('location:fix.uncertain', { reading, area });
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
  return type === RequestType.CHECK_IN ? t('location:autoNeeds.CHECK_IN') : t('location:autoNeeds.CHECK_OUT');
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
