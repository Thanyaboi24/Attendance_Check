import { describe, expect, it } from 'vitest';
import { classify, distanceM, type GeofenceParams, type LocationReading } from '../src/domain/locationClassifier';
import { LocationClass } from '../src/enums';

const cfg: GeofenceParams = {
  centerLat: 14.0693,
  centerLng: 100.6035,
  radiusM: 150,
  maxLocationAgeSec: 60,
  maxAccuracyM: 30,
};
const now = new Date('2026-11-01T01:33:13Z');
const metresPerDegLat = (6_371_000 * Math.PI) / 180;

/** A reading `north` metres north of the centre, measured `ageSec` before `now`. */
function reading(north: number, accuracyM: number | null, ageSec = 5): LocationReading {
  return {
    lat: cfg.centerLat + north / metresPerDegLat,
    lng: cfg.centerLng,
    accuracyM,
    measuredAt: new Date(now.getTime() - ageSec * 1000).toISOString(),
  };
}

describe('distanceM (flat-earth approximation)', () => {
  it('is zero at the centre', () => {
    expect(distanceM(cfg, { lat: cfg.centerLat, lng: cfg.centerLng })).toBe(0);
  });

  it('measures north-south displacement exactly', () => {
    expect(distanceM(cfg, reading(100, 5))).toBeCloseTo(100, 6);
  });

  it('scales east-west displacement by cos(latitude)', () => {
    const metresPerDegLng = metresPerDegLat * Math.cos((cfg.centerLat * Math.PI) / 180);
    const d = distanceM(cfg, { lat: cfg.centerLat, lng: cfg.centerLng + 120 / metresPerDegLng });
    expect(d).toBeCloseTo(120, 6);
  });

  it('agrees with haversine to within 0.1 m inside 1 km', () => {
    const p = { lat: 14.0745, lng: 100.6091 };
    const toRad = (x: number) => (x * Math.PI) / 180;
    const dLat = toRad(p.lat - cfg.centerLat);
    const dLng = toRad(p.lng - cfg.centerLng);
    const h =
      Math.sin(dLat / 2) ** 2 + Math.cos(toRad(cfg.centerLat)) * Math.cos(toRad(p.lat)) * Math.sin(dLng / 2) ** 2;
    const haversine = 2 * 6_371_000 * Math.asin(Math.sqrt(h));
    expect(Math.abs(distanceM(cfg, p) - haversine)).toBeLessThan(0.1);
  });
});

describe('classify (DS2 §2.6.4)', () => {
  it('confirms inside when d + a <= r', () => {
    expect(classify(reading(100, 20), cfg, now).classification).toBe(LocationClass.CONFIRMED_INSIDE);
  });

  it('treats d + a == r as inside (boundary inclusive)', () => {
    const r = classify(reading(120, 30), cfg, now);
    // floating point: allow tiny error by checking the rule directly
    expect(r.distanceM! + 30).toBeCloseTo(150, 6);
    expect([LocationClass.CONFIRMED_INSIDE, LocationClass.UNCERTAIN]).toContain(r.classification);
    expect(classify(reading(119.999, 30), cfg, now).classification).toBe(LocationClass.CONFIRMED_INSIDE);
  });

  it('confirms outside when d - a > r', () => {
    expect(classify(reading(200, 20), cfg, now).classification).toBe(LocationClass.CONFIRMED_OUTSIDE);
  });

  it('is uncertain when d - a == r (outside requires strictly greater)', () => {
    expect(classify(reading(170.0001, 20), cfg, now).classification).toBe(LocationClass.CONFIRMED_OUTSIDE);
    expect(classify(reading(169.999, 20), cfg, now).classification).toBe(LocationClass.UNCERTAIN);
  });

  it('scenario 7: uncertainty circle straddling the boundary is UNCERTAIN', () => {
    const r = classify(reading(145, 25), cfg, now);
    expect(r.classification).toBe(LocationClass.UNCERTAIN);
    expect(r.uncertainReason).toBe('STRADDLES_BOUNDARY');
  });

  it('scenario 8: reading older than maxLocationAgeSec is UNCERTAIN', () => {
    const r = classify(reading(10, 5, 61), cfg, now);
    expect(r.classification).toBe(LocationClass.UNCERTAIN);
    expect(r.uncertainReason).toBe('STALE_READING');
    expect(classify(reading(10, 5, 60), cfg, now).classification).toBe(LocationClass.CONFIRMED_INSIDE);
  });

  it('scenario 8: accuracy worse than maxAccuracyM is UNCERTAIN, even deep inside', () => {
    const r = classify(reading(0, 31), cfg, now);
    expect(r.classification).toBe(LocationClass.UNCERTAIN);
    expect(r.uncertainReason).toBe('LOW_ACCURACY');
  });

  it('missing accuracy or bad timestamp is UNCERTAIN', () => {
    expect(classify(reading(0, null), cfg, now).uncertainReason).toBe('MISSING_DATA');
    expect(classify({ ...reading(0, 5), measuredAt: 'not-a-date' }, cfg, now).uncertainReason).toBe('MISSING_DATA');
    expect(classify({ ...reading(0, 5), lat: Number.NaN }, cfg, now).uncertainReason).toBe('MISSING_DATA');
  });

  it('a reading from the future beyond tolerance is treated as stale', () => {
    expect(classify(reading(0, 5, -30), cfg, now).uncertainReason).toBe('STALE_READING');
    expect(classify(reading(0, 5, -2), cfg, now).classification).toBe(LocationClass.CONFIRMED_INSIDE);
  });

  it('respects a different radius (configuration version change)', () => {
    const wide = { ...cfg, radiusM: 200 };
    expect(classify(reading(165, 10), cfg, now).classification).toBe(LocationClass.CONFIRMED_OUTSIDE);
    expect(classify(reading(165, 10), wide, now).classification).toBe(LocationClass.CONFIRMED_INSIDE);
  });
});
