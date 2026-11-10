import { RequestType } from '@attendance/shared';
import {
  autoRequirementNote,
  bangkokClock,
  countdown,
  describeFix,
  distanceBar,
  regionFor,
  relativeAge,
  shortRequestId,
} from '../src/features/locationMap/locationModel';

describe('countdown ring (mockup page 4)', () => {
  const start = '2026-11-01T01:28:00.000Z';
  const deadline = '2026-11-01T01:33:00.000Z'; // 5 min grace

  it('shows m:ss and the remaining share of the grace period', () => {
    const c = countdown(start, deadline, new Date('2026-11-01T01:29:48.000Z'));
    expect(c.label).toBe('3:12');
    expect(c.remainingSec).toBe(192);
    expect(c.fraction).toBeCloseTo(192 / 300);
    expect(c.expired).toBe(false);
  });

  it('rounds partial seconds up so it never shows 0:00 before the deadline', () => {
    expect(countdown(start, deadline, new Date('2026-11-01T01:32:59.400Z')).label).toBe('0:01');
  });

  it('stops at 0:00 once the deadline has passed', () => {
    const c = countdown(start, deadline, new Date('2026-11-01T01:40:00.000Z'));
    expect(c).toMatchObject({ label: '0:00', remainingSec: 0, fraction: 0, expired: true });
  });
});

describe('distance bar', () => {
  it('places boundary, marker and accuracy band on a 0 … 1.25 × radius track', () => {
    const b = distanceBar(143, 28, 150);
    expect(b.boundary).toBeCloseTo(0.8);
    expect(b.marker).toBeCloseTo(143 / 187.5);
    expect(b.bandStart).toBeCloseTo(115 / 187.5);
    expect(b.bandEnd).toBeCloseTo(171 / 187.5);
  });

  it('clamps readings far outside the area to the track', () => {
    const b = distanceBar(900, 50, 150);
    expect(b).toMatchObject({ marker: 1, bandStart: 1, bandEnd: 1 });
    expect(distanceBar(5, 20, 150).bandStart).toBe(0);
  });

  it('treats unknown accuracy as a zero-width band', () => {
    const b = distanceBar(84, null, 150);
    expect(b.bandStart).toBe(b.bandEnd);
  });
});

describe('location wording', () => {
  const at = '2026-11-01T01:44:10.000Z';

  it('describes an uncertain reading near the edge (page 4 copy)', () => {
    expect(describeFix({ classification: 'UNCERTAIN', distanceM: 143.4, accuracyM: 28, measuredAt: at }, 150)).toBe(
      '143 m from centre, accuracy ±28 m. You are close to the edge of the 150 m area.',
    );
  });

  it('describes inside and outside readings', () => {
    expect(describeFix({ classification: 'CONFIRMED_INSIDE', distanceM: 84, accuracyM: 12, measuredAt: at }, 150)).toMatch(/inside the 150 m area/);
    expect(describeFix({ classification: 'CONFIRMED_OUTSIDE', distanceM: 310, accuracyM: null, measuredAt: at }, 150)).toBe(
      '310 m from centre. You are outside the 150 m area.',
    );
  });

  it('only asks for a confirmed reading on the side the request needs', () => {
    expect(autoRequirementNote(RequestType.CHECK_IN, 'UNCERTAIN')).toBe('Automatic check-in needs a confirmed inside reading.');
    expect(autoRequirementNote(RequestType.CHECK_IN, 'CONFIRMED_INSIDE')).toBeNull();
    expect(autoRequirementNote(RequestType.CHECK_OUT, 'CONFIRMED_INSIDE')).toBe('Automatic check-out needs a confirmed outside reading.');
    expect(autoRequirementNote(RequestType.CHECK_OUT, 'CONFIRMED_OUTSIDE')).toBeNull();
    expect(autoRequirementNote(RequestType.CHECK_IN, null)).not.toBeNull();
  });

  it('formats ages and Bangkok clock times', () => {
    const now = new Date('2026-11-01T01:46:10.000Z');
    expect(relativeAge('2026-11-01T01:46:00.000Z', now)).toBe('just now');
    expect(relativeAge(at, now)).toBe('2 min ago');
    expect(relativeAge('2026-10-31T23:00:00.000Z', now)).toBe('at 06:00');
    expect(bangkokClock(at)).toBe('08:44:10');
  });

  it('shortens request ids for display', () => {
    expect(shortRequestId('a7f3c2d1-0000-4000-8000-000000000000')).toBe('a7f3');
  });
});

describe('map camera', () => {
  it('centres on the area and fits the whole circle', () => {
    const r = regionFor({ centerLat: 14.0693, centerLng: 100.6035, radiusM: 150 });
    expect(r).toMatchObject({ latitude: 14.0693, longitude: 100.6035 });
    // 300 m diameter ≈ 0.0027° latitude; the region shows more than that.
    expect(r.latitudeDelta).toBeGreaterThan(0.0027);
    expect(r.longitudeDelta).toBeGreaterThan(r.latitudeDelta);
  });
});
