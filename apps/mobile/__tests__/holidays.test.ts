import type { HolidayDto } from '@attendance/shared';
import { ApiRequestError } from '../src/domain/errors';
import {
  __resetHolidayRefreshForTests,
  holidayFor,
  holidayMap,
  holidayOn,
  holidayToday,
  holidayWindow,
  loadHolidayCache,
  META_HOLIDAYS,
  refreshHolidays,
  saveHolidayCache,
} from '../src/domain/holidays';
import { confirmAttendance } from '../src/domain/useCases/confirmAttendance';
import { evaluateAutoAttendance } from '../src/domain/useCases/evaluateAutoAttendance';
import { handleGeofenceTransition } from '../src/domain/useCases/handleGeofenceTransition';
import { __resetSyncForTests, syncOutbox } from '../src/domain/useCases/syncOutbox';
import { buildMonthGrid, dayKind, monthBounds, nextHoliday, shiftMonth } from '../src/features/calendar/calendarModel';
import { summarizeHours } from '../src/features/hours/hoursModel';
import { i18n, t } from '../src/i18n';
import { type Harness, INSIDE, makeDeps } from './fakes/makeDeps';

// T0 in makeDeps is 2026-11-03 08:00 Bangkok.
const TODAY = '2026-11-03';

const holiday = (date: string, extra: Partial<HolidayDto> = {}): HolidayDto => ({
  id: `h-${date}`,
  date,
  nameEn: 'Test Holiday',
  nameTh: 'วันหยุดทดสอบ',
  type: 'PUBLIC',
  note: null,
  ...extra,
});

const DECEMBER = [
  holiday('2026-12-05', { nameEn: "King Bhumibol's Birthday / Father's Day", nameTh: 'วันคล้ายวันพระบรมราชสมภพ รัชกาลที่ 9 / วันพ่อแห่งชาติ' }),
  holiday('2026-12-07', { type: 'SUBSTITUTE', nameEn: "Substitution for Father's Day", nameTh: 'วันหยุดชดเชยวันพ่อแห่งชาติ' }),
  holiday('2026-12-10', { nameEn: 'Constitution Day', nameTh: 'วันรัฐธรรมนูญ' }),
  holiday('2026-12-16', { type: 'UNIVERSITY', nameEn: 'University Day', nameTh: 'วันสถาปนามหาวิทยาลัย' }),
  holiday('2026-12-31', { nameEn: "New Year's Eve", nameTh: 'วันสิ้นปี' }),
];

const enter = (h: Harness) => handleGeofenceTransition(h.deps, { transition: 'ENTER', regionId: 'faculty-v1', detectedAt: h.clock.now().toISOString() });
const exit = (h: Harness) => handleGeofenceTransition(h.deps, { transition: 'EXIT', regionId: 'faculty-v1', detectedAt: h.clock.now().toISOString() });

async function cacheHolidays(h: Harness, list: HolidayDto[]) {
  await saveHolidayCache(h.store, { fetchedAt: h.clock.now().toISOString(), from: '2026-10-01', to: '2027-11-01', holidays: list });
}

const holidayClosed = (date = TODAY) =>
  new ApiRequestError(422, 'HOLIDAY_CHECK_IN_CLOSED', 'Check-in is closed today (Test Holiday).', { holiday: holiday(date) });

beforeEach(() => {
  __resetHolidayRefreshForTests();
  __resetSyncForTests();
});

describe('holiday cache', () => {
  it('holidayFor / holidayMap find the holiday of a date', () => {
    expect(holidayFor('2026-12-05', DECEMBER)?.nameEn).toContain('Father');
    expect(holidayFor('2026-12-06', DECEMBER)).toBeNull();
    expect(holidayFor('2026-12-05', null)).toBeNull();
    expect(holidayFor('2026-12-10', { fetchedAt: '', from: '', to: '', holidays: DECEMBER })?.nameEn).toBe('Constitution Day');
    expect([...holidayMap(DECEMBER).keys()]).toEqual(['2026-12-05', '2026-12-07', '2026-12-10', '2026-12-16', '2026-12-31']);
  });

  it('fetches [today − 31 d, today + 365 d] (within the 400-day limit) and stores it', async () => {
    const h = makeDeps();
    h.backend.holidayList = [holiday('2026-10-01'), ...DECEMBER, holiday('2028-01-01')];
    const r = await refreshHolidays(h.deps);
    expect(holidayWindow(h.clock.now())).toEqual({ from: '2026-10-03', to: '2027-11-03' });
    expect(r.fresh).toBe(true);
    expect(r.cache?.holidays.map((x) => x.date)).toEqual(DECEMBER.map((x) => x.date));
    expect((await loadHolidayCache(h.store))?.from).toBe('2026-10-03');
  });

  it('keeps the last cache when the refresh fails (offline) and never throws', async () => {
    const h = makeDeps();
    h.backend.holidayList = DECEMBER;
    await refreshHolidays(h.deps);
    h.backend.offline = true;
    const r = await refreshHolidays(h.deps);
    expect(r.fresh).toBe(false);
    expect(r.cache?.holidays).toHaveLength(5);
  });

  it('ignores a corrupt cache entry', async () => {
    const h = makeDeps();
    await h.store.setMeta(META_HOLIDAYS, '{not json');
    expect(await loadHolidayCache(h.store)).toBeNull();
    expect(await holidayToday(h.deps)).toBeNull();
  });

  it("prefers the server's todayHoliday from a newer state refresh of the same day", async () => {
    const h = makeDeps();
    await h.seed();
    await cacheHolidays(h, [holiday(TODAY)]);
    expect((await holidayOn(h.deps, TODAY))?.id).toBe(`h-${TODAY}`);
    // A later state refresh says "no holiday today" (e.g. the administrator removed it).
    h.clock.advance(60_000);
    const snap = await h.store.getSnapshot();
    await h.store.saveSnapshot({ ...snap!, todayHoliday: null, fetchedAt: h.clock.now().toISOString(), serverTime: h.clock.now().toISOString() });
    expect(await holidayOn(h.deps, TODAY)).toBeNull();
    // Another day: the cache answers.
    await cacheHolidays(h, [holiday(TODAY), holiday('2026-11-04')]);
    expect((await holidayOn(h.deps, '2026-11-04'))?.date).toBe('2026-11-04');
  });
});

describe('geofence on a holiday', () => {
  it('ENTER on a cached holiday creates no request and no notification, and logs HOLIDAY_SKIPPED (works offline)', async () => {
    const h = makeDeps();
    await h.seed();
    await cacheHolidays(h, [holiday(TODAY)]);
    h.backend.offline = true;

    const out = await enter(h);
    expect(out).toMatchObject({ kind: 'HOLIDAY_SKIPPED', date: TODAY, holiday: { id: `h-${TODAY}` } });
    expect(await h.store.listRequests(10)).toHaveLength(0);
    expect(h.notifier.presented).toHaveLength(0);
    expect(h.notifier.info).toHaveLength(0);
    expect(h.store.outbox).toHaveLength(0);
    expect(h.backend.callsOf('createRequest')).toHaveLength(0);
    expect(h.store.events.find((e) => e.type === 'HOLIDAY_SKIPPED')?.detail).toMatchObject({ date: TODAY, transition: 'ENTER' });
  });

  it('EXIT on a holiday still creates the check-out request', async () => {
    const h = makeDeps();
    await h.seed({ openSession: true });
    await cacheHolidays(h, [holiday(TODAY)]);
    const out = await exit(h);
    expect(out).toMatchObject({ kind: 'REQUEST_CREATED', type: 'CHECK_OUT', notification: 'POSTED' });
    expect(h.notifier.presented).toHaveLength(1);
  });

  it('a 422 HOLIDAY_CHECK_IN_CLOSED on create closes the request as a holiday (not a failure) and remembers the day', async () => {
    const h = makeDeps();
    await h.seed();
    h.backend.holidayList = [holiday(TODAY)]; // the phone has no cache yet
    const out = await enter(h);
    expect(out).toMatchObject({ kind: 'HOLIDAY_CLOSED', holiday: { date: TODAY } });
    const id = (out as { requestId: string }).requestId;
    expect(await h.store.getRequest(id)).toMatchObject({ status: 'CANCELLED', resolutionReason: 'HOLIDAY', syncStatus: 'SYNCED', localAction: null });
    expect(h.store.outbox).toHaveLength(0);
    expect(h.scheduler.jobs.has(id)).toBe(false);
    expect(h.notifier.dismissed).toContain(id);
    expect(h.notifier.info.at(-1)?.title).toBe(t('notifications:holiday.title'));
    expect((await loadHolidayCache(h.store))?.holidays.map((x) => x.date)).toEqual([TODAY]);

    // The next ENTER is skipped locally.
    expect((await enter(h)).kind).toBe('HOLIDAY_SKIPPED');
  });

  it('a queued create refused with HOLIDAY_CHECK_IN_CLOSED during sync is dropped, not retried', async () => {
    const h = makeDeps();
    await h.seed();
    h.backend.offline = true;
    const out = await enter(h);
    expect(out).toMatchObject({ kind: 'REQUEST_CREATED', sync: 'PENDING_SYNC' });
    const id = (out as { requestId: string }).requestId;

    h.backend.offline = false;
    h.backend.failNext('createRequest', holidayClosed());
    const s = await syncOutbox(h.deps);
    expect(s.failed).toBe(1);
    expect(s.remaining).toBe(0);
    expect(h.store.outbox).toHaveLength(0);
    expect(await h.store.getRequest(id)).toMatchObject({ status: 'CANCELLED', resolutionReason: 'HOLIDAY', syncStatus: 'SYNCED' });
    expect(h.store.events.some((e) => e.type === 'HOLIDAY_CLOSED')).toBe(true);

    h.backend.calls = [];
    const again = await syncOutbox(h.deps);
    expect(again.sent + again.failed).toBe(0);
    expect(h.backend.callsOf('createRequest')).toHaveLength(0);
  });
});

describe('confirm on a holiday', () => {
  async function pendingCheckIn(h: Harness) {
    await h.seed();
    const out = await enter(h);
    if (out.kind !== 'REQUEST_CREATED') throw new Error(out.kind);
    return out.requestId;
  }

  it('the check-in action (dashboard or notification) is closed locally: no fix, nothing sent', async () => {
    const h = makeDeps();
    const id = await pendingCheckIn(h);
    await cacheHolidays(h, [holiday(TODAY)]);
    h.backend.calls = [];

    const res = await confirmAttendance(h.deps, { requestId: id, userConfirmedAt: h.clock.now().toISOString(), via: 'NOTIFICATION' });
    expect(res).toMatchObject({ kind: 'HOLIDAY_CLOSED', holiday: { date: TODAY } });
    expect(h.location.calls).toBe(0);
    expect(h.backend.calls).toHaveLength(0);
  });

  it('a 422 HOLIDAY_CHECK_IN_CLOSED from confirm closes the request', async () => {
    const h = makeDeps();
    const id = await pendingCheckIn(h);
    h.location.next(INSIDE);
    h.backend.failNext('confirm', holidayClosed());
    const res = await confirmAttendance(h.deps, { requestId: id, userConfirmedAt: h.clock.now().toISOString() });
    expect(res).toMatchObject({ kind: 'HOLIDAY_CLOSED', holiday: { date: TODAY } });
    expect(await h.store.getRequest(id)).toMatchObject({ status: 'CANCELLED', resolutionReason: 'HOLIDAY' });
    expect(h.store.outbox.filter((e) => e.kind === 'CONFIRM')).toHaveLength(0);
  });

  it('the server cancelling a pending check-in for a holiday (reason HOLIDAY) is reported as a holiday', async () => {
    const h = makeDeps();
    const id = await pendingCheckIn(h);
    h.backend.holidayList = [holiday(TODAY)];
    h.location.next(INSIDE);
    expect(await confirmAttendance(h.deps, { requestId: id, userConfirmedAt: h.clock.now().toISOString() })).toMatchObject({
      kind: 'HOLIDAY_CLOSED',
    });
  });

  it('check-out is never locked by a holiday', async () => {
    const h = makeDeps();
    await h.seed({ openSession: true });
    await cacheHolidays(h, [holiday(TODAY)]);
    const out = await exit(h);
    if (out.kind !== 'REQUEST_CREATED') throw new Error(out.kind);
    h.location.next({ distanceM: 400, accuracyM: 10 });
    expect((await confirmAttendance(h.deps, { requestId: out.requestId, userConfirmedAt: h.clock.now().toISOString() })).kind).toBe('RECORDED');
  });

  it('automatic attendance cancelled by the server for a holiday posts the holiday message', async () => {
    const h = makeDeps();
    const id = await pendingCheckIn(h);
    h.backend.holidayList = [holiday(TODAY)];
    h.clock.advance(301_000);
    h.location.always(INSIDE);
    const out = await evaluateAutoAttendance(h.deps, id);
    expect(out).toMatchObject({ kind: 'SUBMITTED', result: { status: 'CANCELLED', reason: 'HOLIDAY' } });
    expect(h.notifier.info.at(-1)?.title).toBe(t('notifications:holiday.title'));
  });
});

describe('calendar month grid', () => {
  it('December 2026: weeks start on Monday, holidays flagged, weekends marked', () => {
    const g = buildMonthGrid(2026, 12, DECEMBER, '2026-11-22', 'en');
    expect(g.title).toBe('December 2026');
    expect(g.weekdays).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(g.weeks).toHaveLength(5);
    expect(g.weeks.every((w) => w.length === 7)).toBe(true);
    // 1 Dec 2026 is a Tuesday: the first cell is Monday 30 Nov (previous month).
    expect(g.weeks[0]?.[0]).toMatchObject({ date: '2026-11-30', inMonth: false });
    expect(g.weeks[0]?.[1]).toMatchObject({ date: '2026-12-01', day: 1, inMonth: true });
    expect(g.weeks[4]?.[6]).toMatchObject({ date: '2027-01-03', inMonth: false });
    const cells = g.weeks.flat();
    expect(cells.filter((c) => c.holiday).map((c) => c.day)).toEqual([5, 7, 10, 16, 31]);
    const dec5 = cells.find((c) => c.date === '2026-12-05')!;
    expect(dec5).toMatchObject({ weekend: true });
    expect(dayKind(dec5)).toBe('HOLIDAY');
    expect(dayKind(cells.find((c) => c.date === '2026-12-06')!)).toBe('WEEKEND');
    expect(dayKind(cells.find((c) => c.date === '2026-12-08')!)).toBe('WORKING');
    expect(g.holidays.map((h) => h.date)).toEqual(DECEMBER.map((h) => h.date));
    expect(cells.some((c) => c.today)).toBe(false);
  });

  it('marks today and handles a month starting on Monday (6 weeks when needed)', () => {
    const nov = buildMonthGrid(2026, 11, [], '2026-11-22', 'en');
    expect(nov.weeks[0]?.[0]?.date).toBe('2026-10-26');
    expect(nov.weeks.flat().find((c) => c.today)?.date).toBe('2026-11-22');
    // June 2026 starts on Monday.
    expect(buildMonthGrid(2026, 6, [], '2026-11-22', 'en').weeks[0]?.[0]?.date).toBe('2026-06-01');
    // August 2026 starts on Saturday and has 31 days → 6 rows.
    expect(buildMonthGrid(2026, 8, [], '2026-11-22', 'en').weeks).toHaveLength(6);
  });

  it('Thai: month name and Buddhist Era year, Thai weekday headers', () => {
    const g = buildMonthGrid(2026, 12, DECEMBER, '2026-11-22', 'th');
    expect(g.title).toBe('ธันวาคม 2569');
    expect(g.weekdays).toEqual(['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.']);
  });

  it('month helpers and next holiday', () => {
    expect(monthBounds(2028, 2)).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(nextHoliday(DECEMBER, '2026-11-22')).toMatchObject({ holiday: { date: '2026-12-05' }, inDays: 13 });
    expect(nextHoliday(DECEMBER, '2026-12-05')?.inDays).toBe(0);
    expect(nextHoliday(DECEMBER, '2027-01-01')).toBeNull();
  });

  it('translates the holiday types', async () => {
    expect(t('calendar:type.SUBSTITUTE')).toBe('Substitution day');
    await i18n.changeLanguage('th');
    try {
      expect(t('calendar:type.PUBLIC')).toBe('วันหยุดนักขัตฤกษ์');
      expect(t('calendar:type.SUBSTITUTE')).toBe('วันหยุดชดเชย');
      expect(t('calendar:checkInClosed')).toBe('ปิดการลงเวลาเข้า');
      expect(t('common:tabs.calendar')).toBe('ปฏิทิน');
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});

describe('hours on holidays', () => {
  const bkk = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`).toISOString();
  const s = (id: string, date: string, inT: string, outT: string) => ({
    id,
    checkInAt: bkk(date, inT),
    checkInMethod: 'AUTOMATIC' as const,
    checkOutAt: bkk(date, outT),
    checkOutMethod: 'MANUAL' as const,
    status: 'COMPLETED' as const,
    corrected: false,
  });

  it('a holiday is flagged and never judged against the 7–9 h standard', () => {
    const now = new Date('2026-12-12T12:00:00+07:00');
    // Mon 7 Dec (substitution day, no work), Tue 8 Dec 4 h (below), Thu 10 Dec (holiday, worked 3 h).
    const sum = summarizeHours([s('a', '2026-12-08', '09:00', '13:00'), s('b', '2026-12-10', '09:00', '12:00')], '2026-12-07', '2026-12-13', now, DECEMBER);
    const day = (d: string) => sum.days.find((x) => x.date === d)!;
    expect(day('2026-12-07')).toMatchObject({ standard: null, sessions: [] });
    expect(day('2026-12-07').holiday?.type).toBe('SUBSTITUTE');
    expect(day('2026-12-08')).toMatchObject({ standard: 'BELOW', holiday: null });
    expect(day('2026-12-10')).toMatchObject({ standard: null, minutes: 180 });
    expect(day('2026-12-10').holiday?.nameEn).toBe('Constitution Day');
    expect(sum).toMatchObject({ judgedDays: 1, belowDays: 1, daysWorked: 2, totalMinutes: 420 });
  });

  it('without holidays the old behaviour is unchanged', () => {
    const now = new Date('2026-12-12T12:00:00+07:00');
    const sum = summarizeHours([s('b', '2026-12-10', '09:00', '12:00')], '2026-12-07', '2026-12-13', now);
    expect(sum.days.find((x) => x.date === '2026-12-10')).toMatchObject({ standard: 'BELOW', holiday: null });
  });
});
