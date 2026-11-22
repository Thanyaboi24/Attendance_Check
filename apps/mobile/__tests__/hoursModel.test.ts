import type { SessionDto } from '@attendance/shared';
import { i18n } from '../src/i18n';
import { buildHistoryCards } from '../src/features/history/historyModel';
import {
  decimalHours,
  formatDuration,
  periodRange,
  sessionMinutes,
  shiftPeriod,
  standardFor,
  standardGap,
  summarizeHours,
} from '../src/features/hours/hoursModel';

/** Bangkok wall-clock time → ISO instant (UTC+7). */
const bkk = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`).toISOString();

function session(id: string, date: string, inT: string, outT: string | null, extra: Partial<SessionDto> = {}): SessionDto {
  return {
    id,
    checkInAt: bkk(date, inT),
    checkInMethod: 'AUTOMATIC',
    checkOutAt: outT ? bkk(date, outT) : null,
    checkOutMethod: outT ? 'MANUAL' : null,
    status: outT ? 'COMPLETED' : 'OPEN',
    corrected: false,
    ...extra,
  };
}

describe('working hours model', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('builds Monday–Sunday weeks and calendar months, and moves between them', () => {
    expect(periodRange('WEEK', '2026-11-22')).toEqual({ from: '2026-11-16', to: '2026-11-22' }); // Sunday
    expect(periodRange('WEEK', '2026-11-16')).toEqual({ from: '2026-11-16', to: '2026-11-22' }); // Monday
    expect(periodRange('MONTH', '2026-11-22')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(periodRange('MONTH', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' }); // leap year
    expect(shiftPeriod('WEEK', '2026-11-22', -1)).toBe('2026-11-15');
    expect(shiftPeriod('MONTH', '2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftPeriod('MONTH', '2026-03-31', -1)).toBe('2026-02-01');
  });

  it('sums completed sessions per Bangkok day, including two sessions on one day', () => {
    const now = new Date(bkk('2026-11-22', '20:00'));
    const s = summarizeHours(
      [
        session('a', '2026-11-16', '08:30', '17:15'), // 8 h 45 m
        session('b', '2026-11-17', '08:00', '12:00'), // 4 h
        session('c', '2026-11-17', '13:00', '17:30'), // 4 h 30 m
        session('d', '2026-11-10', '08:00', '17:00'), // outside the week: ignored
      ],
      '2026-11-16',
      '2026-11-22',
      now,
    );
    expect(s.days).toHaveLength(7);
    expect(s.days[0]).toMatchObject({ date: '2026-11-16', minutes: 525 });
    expect(s.days[1]).toMatchObject({ date: '2026-11-17', minutes: 510 });
    expect(s.days[1]?.sessions.map((x) => [x.inTime, x.outTime])).toEqual([
      ['08:00', '12:00'],
      ['13:00', '17:30'],
    ]);
    expect(s).toMatchObject({ totalMinutes: 1035, daysWorked: 2, averageMinutes: 518, running: false, missingCheckOuts: 0 });
    expect(s.longestDay?.date).toBe('2026-11-16');
  });

  it('counts an open session today until now, and never counts a past session without a check-out', () => {
    const now = new Date(bkk('2026-11-18', '11:20'));
    const s = summarizeHours(
      [session('open', '2026-11-18', '08:05', null), session('forgot', '2026-11-17', '08:00', null)],
      '2026-11-16',
      '2026-11-22',
      now,
    );
    const today = s.days.find((d) => d.date === '2026-11-18');
    expect(today).toMatchObject({ minutes: 195, running: true });
    expect(today?.sessions[0]).toMatchObject({ outTime: null, running: true });
    const past = s.days.find((d) => d.date === '2026-11-17');
    expect(past).toMatchObject({ minutes: 0, missingCheckOut: true });
    expect(s).toMatchObject({ totalMinutes: 195, daysWorked: 1, running: true, missingCheckOuts: 1 });
  });

  it('assigns a session that ends after midnight to its check-in day', () => {
    const night: SessionDto = { ...session('n', '2026-11-19', '22:00', null), checkOutAt: bkk('2026-11-20', '02:30'), status: 'COMPLETED', checkOutMethod: 'AUTOMATIC' };
    const s = summarizeHours([night], '2026-11-16', '2026-11-22', new Date(bkk('2026-11-22', '09:00')));
    expect(s.days.find((d) => d.date === '2026-11-19')?.minutes).toBe(270);
    expect(s.days.find((d) => d.date === '2026-11-20')?.minutes).toBe(0);
  });

  it('judges each finished day against the 7–9 hour standard (boundaries count as within)', () => {
    expect(standardFor(8 * 60)).toBe('WITHIN'); // 09:00 → 17:00
    expect(standardFor(7 * 60)).toBe('WITHIN'); // 09:00 → 16:00
    expect(standardFor(9 * 60)).toBe('WITHIN');
    expect(standardFor(7 * 60 - 1)).toBe('BELOW');
    expect(standardFor(9 * 60 + 1)).toBe('ABOVE');
  });

  it('shows when each day started and ended, its verdict and the gap to the standard', () => {
    const now = new Date(bkk('2026-11-20', '10:00'));
    const s = summarizeHours(
      [
        session('mon', '2026-11-16', '09:00', '17:00'), // 8 h: within
        session('tue', '2026-11-17', '09:00', '16:00'), // 7 h: within
        session('wed', '2026-11-18', '09:30', '15:15'), // 5 h 45 m: below
        session('thu1', '2026-11-19', '07:30', '12:00'), // two sessions: 4 h 30 m + 5 h 30 m = 10 h: over
        session('thu2', '2026-11-19', '13:00', '18:30'),
        session('fri', '2026-11-20', '08:30', null), // today, still in: no verdict
      ],
      '2026-11-16',
      '2026-11-22',
      now,
    );
    const day = (d: string) => s.days.find((x) => x.date === d)!;
    expect(day('2026-11-16')).toMatchObject({ arrivedAt: '09:00', leftAt: '17:00', minutes: 480, standard: 'WITHIN' });
    expect(day('2026-11-17')).toMatchObject({ arrivedAt: '09:00', leftAt: '16:00', minutes: 420, standard: 'WITHIN' });
    expect(day('2026-11-18')).toMatchObject({ minutes: 345, standard: 'BELOW' });
    expect(day('2026-11-19')).toMatchObject({ arrivedAt: '07:30', leftAt: '18:30', minutes: 600, standard: 'ABOVE' });
    expect(day('2026-11-20')).toMatchObject({ arrivedAt: '08:30', leftAt: null, running: true, standard: null });
    expect(day('2026-11-21')).toMatchObject({ arrivedAt: null, standard: null });
    expect(s).toMatchObject({ judgedDays: 4, withinDays: 2, belowDays: 1, aboveDays: 1 });
    expect(standardGap(day('2026-11-18'))).toBe('1 h 15 m short of the standard');
    expect(standardGap(day('2026-11-19'))).toBe('1 h over the standard');
    expect(standardGap(day('2026-11-16'))).toBeNull();
  });

  it('does not judge a day whose check-out is missing', () => {
    const s = summarizeHours([session('x', '2026-11-16', '09:00', null)], '2026-11-16', '2026-11-22', new Date(bkk('2026-11-18', '09:00')));
    expect(s.days[0]).toMatchObject({ missingCheckOut: true, leftAt: null, standard: null });
    expect(s.judgedDays).toBe(0);
  });

  it('formats durations in English and Thai', async () => {
    expect(formatDuration(0)).toBe('0 h');
    expect(formatDuration(45)).toBe('45 m');
    expect(formatDuration(480)).toBe('8 h');
    expect(formatDuration(525)).toBe('8 h 45 m');
    expect(decimalHours(525)).toBe('8.8');
    expect(decimalHours(480)).toBe('8');
    await i18n.changeLanguage('th');
    expect(formatDuration(525)).toBe('8 ชม. 45 นาที');
    expect(formatDuration(30)).toBe('30 นาที');
    expect(standardGap({ minutes: 345, standard: 'BELOW' })).toBe('น้อยกว่ามาตรฐาน 1 ชม. 15 นาที');
  });

  it('adds the worked time to history cards, but not when the check-out is missing', () => {
    const now = new Date(bkk('2026-11-18', '10:00'));
    expect(sessionMinutes(session('x', '2026-11-18', '09:00', null), '2026-11-18', now)).toEqual({ minutes: 60, running: true, missing: false });
    const cards = buildHistoryCards(
      [session('done', '2026-11-16', '08:30', '17:15'), session('forgot', '2026-11-17', '08:00', null)],
      [],
      '2026-11-18',
      now,
    );
    expect(cards.find((c) => c.key === 'done')?.workedLabel).toBe('Worked 8 h 45 m');
    expect(cards.find((c) => c.key === 'forgot')?.workedLabel).toBeNull();
  });
});
