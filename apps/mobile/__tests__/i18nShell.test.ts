import { NOTIFICATION_TEXT } from '@attendance/shared';
import { displayLabel, DISPLAY_LABEL, reasonText, uncertainReasonText } from '../src/domain/displayStatus';
import { validationMessage } from '../src/domain/errors';
import { adminWebMessage } from '../src/domain/useCases/auth';
import { i18n, t } from '../src/i18n';
import { en } from '../src/i18n/en';
import { th } from '../src/i18n/th';

/** Namespaces of the app shell (navigation, auth, onboarding, settings, notifications, shared labels). */
const SHELL_NAMESPACES = ['common', 'auth', 'onboarding', 'settings', 'notifications', 'errors'] as const;

/** Every leaf as `a.b.c` → value. */
function leaves(obj: unknown, prefix = ''): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object') for (const [p, x] of leaves(v, path)) out.set(p, x);
    else out.set(path, v);
  }
  return out;
}

describe('i18n shell namespaces (en ↔ th)', () => {
  it.each(SHELL_NAMESPACES)('%s: same keys in both languages, no empty Thai text', (ns) => {
    const enLeaves = leaves(en[ns]);
    const thLeaves = leaves(th[ns]);
    expect(enLeaves.size).toBeGreaterThan(0);
    expect([...thLeaves.keys()].sort()).toEqual([...enLeaves.keys()].sort());
    for (const [key, value] of thLeaves) {
      expect({ key, type: typeof value }).toEqual({ key, type: 'string' });
      expect({ key, empty: String(value).trim() === '' }).toEqual({ key, empty: false });
    }
  });

  it('English request notification matches NOTIFICATION_TEXT in packages/shared', () => {
    const shared = (s: string) => s.replace('{minutes}', '{{minutes}}');
    expect(en.notifications.request.checkIn.title).toBe(NOTIFICATION_TEXT.CHECK_IN.title);
    expect(en.notifications.request.checkIn.body).toBe(shared(NOTIFICATION_TEXT.CHECK_IN.body));
    expect(en.notifications.request.checkOut.title).toBe(NOTIFICATION_TEXT.CHECK_OUT.title);
    expect(en.notifications.request.checkOut.body).toBe(shared(NOTIFICATION_TEXT.CHECK_OUT.body));
  });

  it('keeps the same {{placeholders}} in Thai', () => {
    const vars = (s: string) => (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((v) => v.replace(/\s/g, '')).sort();
    for (const ns of SHELL_NAMESPACES) {
      const thLeaves = leaves(th[ns]);
      for (const [key, value] of leaves(en[ns])) {
        expect({ key: `${ns}:${key}`, vars: vars(String(thLeaves.get(key))) }).toEqual({ key: `${ns}:${key}`, vars: vars(String(value)) });
      }
    }
  });
});

describe('plain functions follow the current language', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('English by default in tests', () => {
    expect(DISPLAY_LABEL.RECORDED).toBe('Recorded');
    expect(displayLabel('UNSYNCHRONIZED')).toBe('Pending synchronization');
    expect(reasonText('SESSION_ALREADY_OPEN')).toBe('You are already checked in.');
    expect(reasonText('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(validationMessage('Enter your password', 'x')).toBe('Enter your password');
  });

  it('switches to Thai and back', async () => {
    await i18n.changeLanguage('th');
    expect(DISPLAY_LABEL.RECORDED).toBe('บันทึกแล้ว');
    expect(displayLabel('CANCELLED')).toBe('ยกเลิกแล้ว');
    expect(reasonText('SESSION_ALREADY_OPEN')).toBe('คุณลงเวลาเข้าแล้ว');
    expect(uncertainReasonText('LOW_ACCURACY')).toContain('ความแม่นยำ');
    expect(adminWebMessage()).toContain('Admin Web');
    expect(validationMessage('Enter your password', 'x')).toBe('กรุณากรอกรหัสผ่าน');
    expect(t('notifications:request.checkIn.body', { minutes: '5' })).toContain('5 นาที');
    expect(t('notifications:actions.checkOut')).toBe('ลงเวลาออก');

    await i18n.changeLanguage('en');
    expect(DISPLAY_LABEL.RECORDED).toBe('Recorded');
    expect(t('notifications:request.checkIn.title')).toBe('Please confirm your check-in');
  });
});
