import { RequestStatus, RequestType, type SessionDto } from '@attendance/shared';
import { correctionTimes, defaultFix, fixOptions, to12h } from '../src/features/correction/correctionModel';
import { buildTodayTimeline } from '../src/features/dashboard/timelineModel';
import { buildHistoryCards, dayLabel, filterByMethod, presetRange, rangeLabel } from '../src/features/history/historyModel';

// Bangkok = UTC+7: 01:28Z is 08:28 local.
const session = (over: Partial<SessionDto>): SessionDto => ({
  id: 's1',
  checkInAt: '2026-10-31T01:31:00.000Z',
  checkInMethod: 'MANUAL',
  checkOutAt: null,
  checkOutMethod: null,
  status: 'OPEN',
  corrected: false,
  ...over,
});

describe('today timeline (mockup page 3)', () => {
  const now = new Date('2026-10-31T02:00:00.000Z');

  it('lists entry, notification and the recorded check-in in time order', () => {
    const items = buildTodayTimeline(
      [
        {
          requestId: 'r1',
          type: RequestType.CHECK_IN,
          status: RequestStatus.APPROVED,
          geofenceDetectedAt: '2026-10-31T01:28:00.000Z',
          notificationPostedAt: '2026-10-31T01:28:05.000Z',
          notificationStatus: 'POSTED',
          resolutionReason: null,
          updatedAt: '2026-10-31T01:31:00.000Z',
        },
      ],
      [session({})],
      now,
    );
    expect(items.map((i) => `${i.time} ${i.text}`)).toEqual([
      '08:28 Entered faculty area',
      '08:28 Check-in request sent',
      '08:31 Checked in · manual',
    ]);
    expect(items.map((i) => i.tone)).toEqual(['neutral', 'pending', 'success']);
  });

  it('shows requests that ended without a record and ignores other days', () => {
    const items = buildTodayTimeline(
      [
        {
          requestId: 'r2',
          type: RequestType.CHECK_OUT,
          status: RequestStatus.UNRESOLVED,
          geofenceDetectedAt: '2026-10-31T01:40:00.000Z',
          notificationPostedAt: null,
          notificationStatus: 'FAILED',
          resolutionReason: 'UNCERTAIN_LOCATION',
          updatedAt: '2026-10-31T01:45:00.000Z',
        },
        {
          requestId: 'old',
          type: RequestType.CHECK_IN,
          status: RequestStatus.APPROVED,
          geofenceDetectedAt: '2026-10-30T01:00:00.000Z',
          notificationPostedAt: '2026-10-30T01:00:05.000Z',
          notificationStatus: 'POSTED',
          resolutionReason: null,
          updatedAt: '2026-10-30T01:02:00.000Z',
        },
      ],
      [],
      now,
    );
    expect(items.map((i) => i.text)).toEqual([
      'Left faculty area',
      'Check-out notification could not be shown',
      'Check-out not recorded · uncertain location',
    ]);
  });
});

describe('history cards (mockup page 6)', () => {
  const today = '2026-10-31';

  it('labels completed, open, corrected and needs-review sessions', () => {
    const cards = buildHistoryCards(
      [
        session({ id: 'fri', checkOutAt: '2026-10-31T09:42:00.000Z', checkOutMethod: 'AUTOMATIC', status: 'COMPLETED' }),
        session({ id: 'wed', checkInAt: '2026-10-29T02:02:00.000Z' }),
        session({
          id: 'tue',
          checkInAt: '2026-10-28T01:40:00.000Z',
          checkInMethod: 'ADMIN_CORRECTED',
          checkOutAt: '2026-10-28T09:30:00.000Z',
          checkOutMethod: 'MANUAL',
          status: 'COMPLETED',
          corrected: true,
        }),
      ],
      [{ id: 'i1', type: RequestType.CHECK_OUT, geofenceDetectedAt: '2026-10-29T10:00:00.000Z' }],
      today,
    );
    expect(cards.map((c) => [c.dayLabel, c.status, c.inTime, c.inLabel, c.outTime, c.outLabel])).toEqual([
      ['Sat 31 Oct', 'COMPLETED', '08:31', 'Manual', '16:42', 'Automatic'],
      ['Thu 29 Oct', 'NEEDS_REVIEW', '09:02', 'Manual', null, 'Unresolved'],
      ['Wed 28 Oct', 'CORRECTED', '08:40', 'Admin corrected', '16:30', 'Manual'],
    ]);
    expect(cards.filter((c) => c.needsCorrection).map((c) => c.key)).toEqual(['wed']);
  });

  it('keeps today’s session open and adds a card for a day with only an unresolved request', () => {
    const cards = buildHistoryCards(
      [session({ id: 'today' })],
      [{ id: 'i2', type: RequestType.CHECK_IN, geofenceDetectedAt: '2026-10-27T01:00:00.000Z' }],
      today,
    );
    expect(cards[0]).toMatchObject({ key: 'today', status: 'OPEN', outLabel: 'Not yet', needsCorrection: false });
    expect(cards[1]).toMatchObject({ workDate: '2026-10-27', status: 'NEEDS_REVIEW', inLabel: 'Unresolved', sessionId: null, needsCorrection: true });
  });

  it('filters by method on either side', () => {
    const cards = buildHistoryCards(
      [
        session({ id: 'a', checkOutAt: '2026-10-31T09:00:00.000Z', checkOutMethod: 'AUTOMATIC', status: 'COMPLETED' }),
        session({ id: 'b', checkInAt: '2026-10-30T01:00:00.000Z', checkOutAt: '2026-10-30T09:00:00.000Z', checkOutMethod: 'MANUAL', status: 'COMPLETED' }),
      ],
      [],
      today,
    );
    expect(filterByMethod(cards, 'AUTOMATIC').map((c) => c.key)).toEqual(['a']);
    expect(filterByMethod(cards, 'MANUAL')).toHaveLength(2);
    expect(filterByMethod(cards, 'ALL')).toHaveLength(2);
  });

  it('builds date ranges and labels in Bangkok calendar days', () => {
    expect(presetRange('THIS_WEEK', '2026-10-31')).toEqual({ from: '2026-10-26', to: '2026-10-31' }); // Sat → Monday
    expect(presetRange('THIS_WEEK', '2026-10-26')).toEqual({ from: '2026-10-26', to: '2026-10-26' });
    expect(presetRange('LAST_7', '2026-10-31')).toEqual({ from: '2026-10-25', to: '2026-10-31' });
    expect(rangeLabel('2026-10-27', '2026-10-31')).toBe('27 Oct – 31 Oct 2026');
    expect(rangeLabel('2025-12-29', '2026-01-02')).toBe('29 Dec 2025 – 2 Jan 2026');
    expect(dayLabel('2026-10-29')).toBe('Thu 29 Oct');
  });
});

describe('correction form (mockup page 7)', () => {
  it('suggests the likely fix and names the options after the record', () => {
    const open = { checkInAt: '2026-10-29T02:02:00.000Z', checkOutAt: null };
    expect(defaultFix(open)).toBe('CHECK_OUT');
    expect(defaultFix(null)).toBe('WHOLE_DAY');
    expect(fixOptions(open).map((o) => o.label)).toEqual(['Check-in time', 'Missing check-out', 'Missing whole day']);
    expect(fixOptions(null).map((o) => o.label)).toEqual(['Missing check-in', 'Check-out time', 'Missing whole day']);
  });

  it('converts Bangkok times to UTC instants and only sends the fixed side', () => {
    expect(correctionTimes('CHECK_OUT', '2026-10-29', '09:02', '17:05')).toEqual({
      ok: true,
      requestedCheckInAt: null,
      requestedCheckOutAt: '2026-10-29T10:05:00.000Z',
    });
    expect(correctionTimes('WHOLE_DAY', '2026-10-29', '08:30', '17:00')).toEqual({
      ok: true,
      requestedCheckInAt: '2026-10-29T01:30:00.000Z',
      requestedCheckOutAt: '2026-10-29T10:00:00.000Z',
    });
  });

  it('rejects missing or reversed times', () => {
    expect(correctionTimes('CHECK_IN', '2026-10-29', '', '')).toMatchObject({ ok: false });
    expect(correctionTimes('WHOLE_DAY', '2026-10-29', '17:00', '08:00')).toEqual({ ok: false, message: 'Check-out cannot be before check-in.' });
  });

  it('shows the picker value in 12-hour time', () => {
    expect(to12h('17:05')).toBe('05:05 PM');
    expect(to12h('00:15')).toBe('12:15 AM');
    expect(to12h('12:00')).toBe('12:00 PM');
  });
});
