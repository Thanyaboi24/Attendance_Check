import { MIGRATIONS } from '../src/data/db/migrations';
import { confirmAttendance } from '../src/domain/useCases/confirmAttendance';
import { configVersionFromRegion, handleGeofenceTransition, regionIdFor } from '../src/domain/useCases/handleGeofenceTransition';
import { __resetSyncForTests } from '../src/domain/useCases/syncOutbox';
import { describeFix, shortArea, zoneForFix } from '../src/features/locationMap/locationModel';
import { CONFIG_TWO_CAMPUSES, CONFIG_V1, makeDeps } from './fakes/makeDeps';

const BANGKADI = { lat: 13.98055, lng: 100.55495 }; // ~10 m from the Bangkadi centre
const BETWEEN = { lat: 14.03, lng: 100.58 }; // several km from both campuses

beforeEach(() => __resetSyncForTests());

describe('several attendance areas (Rangsit + Bangkadi)', () => {
  it('names one region per campus and reads the version back from either', () => {
    expect(regionIdFor(CONFIG_TWO_CAMPUSES, 0)).toBe('faculty-v2');
    expect(regionIdFor(CONFIG_TWO_CAMPUSES, 1)).toBe('faculty-v2-z2');
    expect(configVersionFromRegion('faculty-v2-z2')).toBe(2);
    expect(configVersionFromRegion('faculty-v2')).toBe(2);
  });

  it('records a check-in confirmed at the Bangkadi campus', async () => {
    const h = makeDeps({ cfg: CONFIG_TWO_CAMPUSES });
    await h.seed();
    const out = await handleGeofenceTransition(h.deps, { transition: 'ENTER', regionId: 'faculty-v2-z2', detectedAt: h.clock.now().toISOString() });
    expect(out.kind).toBe('REQUEST_CREATED');
    if (out.kind !== 'REQUEST_CREATED') return;
    h.location.next({ at: BANGKADI });
    const res = await confirmAttendance(h.deps, { requestId: out.requestId, userConfirmedAt: h.clock.now().toISOString(), via: 'NOTIFICATION' });
    expect(res).toMatchObject({ kind: 'RECORDED', result: { status: 'APPROVED', method: 'MANUAL' } });
  });

  it('does not record a check-in between the campuses', async () => {
    const h = makeDeps({ cfg: CONFIG_TWO_CAMPUSES });
    await h.seed();
    const out = await handleGeofenceTransition(h.deps, { transition: 'ENTER', regionId: 'faculty-v2', detectedAt: h.clock.now().toISOString() });
    if (out.kind !== 'REQUEST_CREATED') throw new Error(out.kind);
    h.location.next({ at: BETWEEN });
    const res = await confirmAttendance(h.deps, { requestId: out.requestId, userConfirmedAt: h.clock.now().toISOString(), via: 'NOTIFICATION' });
    expect(res).toMatchObject({ kind: 'LOCATION_NOT_CONFIRMED', classification: 'CONFIRMED_OUTSIDE' });
  });

  it('describes a fix against the campus it matched', () => {
    const fix = { accuracyM: 8, distanceM: 12, classification: 'CONFIRMED_INSIDE' as const, measuredAt: '2026-11-15T03:00:00Z', zone: 'SIIT Bangkadi campus' };
    expect(zoneForFix(CONFIG_TWO_CAMPUSES, fix).centerLat).toBeCloseTo(13.980481);
    expect(zoneForFix(CONFIG_TWO_CAMPUSES, null).name).toBe('SIIT Rangsit campus');
    expect(zoneForFix(CONFIG_V1, fix).name).toBe('SIIT Rangsit'); // unknown name → first area
    expect(describeFix(fix, 150, 'SIIT Bangkadi campus')).toBe(
      '12 m from the SIIT Bangkadi campus centre, accuracy ±8 m. You are inside the SIIT Bangkadi campus area (150 m).',
    );
    expect(shortArea('SIIT Bangkadi campus')).toBe('Bangkadi');
  });

  it('adds the zones column to the phone cache in a new migration', () => {
    expect(MIGRATIONS).toHaveLength(2);
    expect(MIGRATIONS[1]).toContain('zones_json');
  });
});
