import { RequestStatus, RequestType, type SessionDto } from '@attendance/shared';
import { fixOptions, to12h } from '../src/features/correction/correctionModel';
import { buildTodayTimeline } from '../src/features/dashboard/timelineModel';
import { buildHistoryCards, dayLabel, longDayLabel, rangeLabel, rangePresetLabels } from '../src/features/history/historyModel';
import { autoRequirementNote, describeFix, locationTitle, relativeAge } from '../src/features/locationMap/locationModel';
import { i18n } from '../src/i18n';
import { en } from '../src/i18n/en';
import { th } from '../src/i18n/th';

const NAMESPACES = ['dashboard', 'location', 'history', 'correction'] as const;

/** Every leaf path of a nested message object, e.g. "fix.inside". */
function leaves(obj: object, prefix = ''): Array<[string, unknown]> {
  return Object.entries(obj).flatMap(([k, v]) =>
    v != null && typeof v === 'object' ? leaves(v as object, `${prefix}${k}.`) : [[`${prefix}${k}`, v] as [string, unknown]],
  );
}

describe('screen namespaces: Thai matches English', () => {
  it.each(NAMESPACES)('%s has the same keys in en and th, and no empty Thai text', (ns) => {
    const enLeaves = leaves(en[ns]);
    const thLeaves = leaves(th[ns]);
    expect(enLeaves.length).toBeGreaterThan(0);
    expect(thLeaves.map(([k]) => k).sort()).toEqual(enLeaves.map(([k]) => k).sort());
    for (const [key, value] of thLeaves) {
      expect([key, typeof value]).toEqual([key, 'string']);
      expect([key, (value as string).trim().length > 0]).toEqual([key, true]);
    }
  });

  it.each(NAMESPACES)('%s keeps the same {{placeholders}} in Thai', (ns) => {
    const vars = (s: unknown) => (String(s).match(/{{\w+}}/g) ?? []).sort();
    const thMap = new Map(leaves(th[ns]));
    for (const [key, value] of leaves(en[ns])) expect([key, vars(thMap.get(key))]).toEqual([key, vars(value)]);
  });
});

describe('screen models in Thai', () => {
  // The jest setup switches back to English after every test, so switch to Thai before each one.
  beforeEach(async () => {
    await i18n.changeLanguage('th');
  });
  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('uses Thai day/month names and the Buddhist Era year', () => {
    expect(dayLabel('2026-10-29')).toBe('พฤ. 29 ต.ค.');
    expect(longDayLabel('2026-10-29')).toBe('พฤ. 29 ต.ค. 2569');
    expect(rangeLabel('2026-10-27', '2026-10-31')).toBe('27 ต.ค. – 31 ต.ค. 2569');
    expect(rangePresetLabels().LAST_7).toBe('7 วันที่ผ่านมา');
  });

  it('builds Thai history cards', () => {
    const session: SessionDto = {
      id: 's1',
      checkInAt: '2026-10-29T02:02:00.000Z',
      checkInMethod: 'MANUAL',
      checkOutAt: null,
      checkOutMethod: null,
      status: 'OPEN',
      corrected: false,
    } as SessionDto;
    const [card] = buildHistoryCards([session], [{ id: 'i1', type: RequestType.CHECK_OUT, geofenceDetectedAt: '2026-10-29T10:00:00.000Z' }], '2026-10-31');
    expect(card).toMatchObject({ dayLabel: 'พฤ. 29 ต.ค.', inLabel: 'ยืนยันเอง', outLabel: 'ไม่สามารถสรุปผลได้' });
  });

  it('writes the home timeline in Thai', () => {
    const now = new Date('2026-11-01T03:00:00.000Z');
    const items = buildTodayTimeline(
      [
        {
          requestId: 'r1',
          type: RequestType.CHECK_IN,
          status: RequestStatus.APPROVED,
          geofenceDetectedAt: '2026-11-01T01:28:00.000Z',
          notificationPostedAt: null,
          notificationStatus: null,
          resolutionReason: null,
          updatedAt: '2026-11-01T01:31:00.000Z',
        } as never,
      ],
      [{ id: 's1', checkInAt: '2026-11-01T01:31:00.000Z', checkInMethod: 'MANUAL', checkOutAt: null, checkOutMethod: null } as SessionDto],
      now,
    );
    expect(items.map((i) => `${i.time} ${i.text}`)).toEqual(['08:28 เข้าพื้นที่คณะ', '08:31 ลงเวลาเข้าแล้ว · ยืนยันเอง']);
  });

  it('describes the location in Thai', () => {
    const at = '2026-11-01T01:44:10.000Z';
    expect(locationTitle('UNCERTAIN')).toBe('ตำแหน่งไม่แน่ชัด');
    expect(describeFix({ classification: 'CONFIRMED_INSIDE', distanceM: 84, accuracyM: 12, measuredAt: at }, 150)).toBe(
      'ห่างจากจุดศูนย์กลาง 84 ม. ความแม่นยำ ±12 ม. คุณอยู่ในพื้นที่รัศมี 150 ม.',
    );
    expect(describeFix({ classification: 'CONFIRMED_OUTSIDE', distanceM: 900, accuracyM: null, measuredAt: at }, 150, 'SIIT Bangkadi campus')).toBe(
      'ห่างจากจุดศูนย์กลางของ SIIT Bangkadi campus 900 ม. คุณอยู่นอกพื้นที่ลงเวลาทุกแห่ง ใกล้ที่สุดคือพื้นที่ SIIT Bangkadi campus (รัศมี 150 ม.)',
    );
    expect(relativeAge('2026-11-01T01:42:00.000Z', new Date('2026-11-01T01:44:10.000Z'))).toBe('2 นาทีที่แล้ว');
    expect(autoRequirementNote(RequestType.CHECK_IN, 'UNCERTAIN')).toBe('การลงเวลาเข้าอัตโนมัติต้องใช้ตำแหน่งที่ยืนยันว่าอยู่ในพื้นที่');
  });

  it('labels correction options in Thai and shows a 24-hour time', () => {
    expect(fixOptions({ checkInAt: '2026-10-29T02:02:00.000Z', checkOutAt: null }).map((o) => o.label)).toEqual([
      'เวลาลงเวลาเข้า',
      'ไม่มีการลงเวลาออก',
      'ไม่มีการลงเวลาทั้งวัน',
    ]);
    expect(to12h('17:05')).toBe('17:05 น.');
  });
});
