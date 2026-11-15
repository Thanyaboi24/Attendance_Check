import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Role } from '@attendance/shared';
import { createElement } from 'react';
import { makeUser, mockApi, renderApp, renderWithClient } from '../test/utils';
import { GeofenceForm } from '../pages/GeofencePage';
import { en } from './en';
import { th } from './th';
import { i18n, setLanguage } from './index';
import { enumLabel, fmtMetres } from '../lib/format';
import { errorMessage, ApiRequestError } from '../api/client';

type Tree = { [k: string]: string | Tree };

/** Every leaf as "a.b.c" → value. */
function leaves(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(path, v);
    else for (const [p, s] of leaves(v, path)) out.set(p, s);
  }
  return out;
}

/** `{{name}}` placeholders and `<tag>` markers that must survive translation. */
const tokens = (s: string) => [...s.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}|<\/?(\w+)>/g)].map((m) => m[0]).sort();

afterEach(async () => {
  await setLanguage('en');
  localStorage.clear();
});

describe('Thai resources', () => {
  it('have exactly the English namespaces and keys, with no empty strings', () => {
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
    for (const ns of Object.keys(en) as (keyof typeof en)[]) {
      const e = leaves(en[ns] as unknown as Tree);
      const t = leaves(th[ns] as unknown as Tree);
      expect([...t.keys()].sort(), `namespace ${ns}`).toEqual([...e.keys()].sort());
      for (const [key, value] of t) {
        expect(value.trim(), `th ${ns}:${key} is empty`).not.toBe('');
        expect(tokens(value), `th ${ns}:${key} placeholders`).toEqual(tokens(e.get(key)!));
      }
    }
  });

  it('translates enums, units and API error codes at call time', async () => {
    expect(enumLabel('requestStatus', 'UNRESOLVED')).toBe('Unresolved');
    expect(fmtMetres(133)).toBe('133 m');
    await i18n.changeLanguage('th');
    expect(enumLabel('requestStatus', 'UNRESOLVED')).toBe('ไม่สามารถสรุปผลได้');
    expect(enumLabel('requestStatus', 'SOMETHING_NEW')).toBe('Something new'); // unknown value: readable fallback
    expect(fmtMetres(133)).toBe('133 ม.');
    expect(fmtMetres(1500)).toBe('1.50 กม.');
    expect(errorMessage(new ApiRequestError(409, 'CORRECTION_NOT_PENDING', 'Already reviewed'))).toBe(
      'คำขอแก้ไขเวลานี้ได้รับการตรวจสอบแล้ว',
    );
    expect(errorMessage(new ApiRequestError(409, 'SIGNUP_NOT_PENDING', 'Already reviewed'))).toBe(
      'คำขอลงทะเบียนนี้ได้รับการพิจารณาแล้ว',
    );
    expect(enumLabel('accountStatus', 'PENDING_APPROVAL')).toBe('รออนุมัติ');
    expect(errorMessage(new ApiRequestError(418, 'TEAPOT', 'I am a teapot'))).toBe('I am a teapot');
  });
});

describe('Language switch', () => {
  it('switches the login page to Thai and sets <html lang>', async () => {
    mockApi({});
    renderApp('/login');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');

    await userEvent.setup().click(screen.getByRole('button', { name: 'ไทย' }));

    expect(await screen.findByRole('button', { name: 'เข้าสู่ระบบ' })).toBeInTheDocument();
    expect(screen.getByText('อีเมล')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('th');
    expect(localStorage.getItem('attendance.lang')).toBe('th');
    expect(screen.getByRole('button', { name: 'ไทย' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows Thai validation messages after switching', async () => {
    mockApi({});
    renderApp('/login');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'ไทย' }));
    await user.type(screen.getByLabelText('อีเมล'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
    expect(await screen.findByText('โปรดกรอกอีเมลที่ถูกต้อง')).toBeInTheDocument();
    expect(screen.getByText('โปรดกรอกรหัสผ่าน')).toBeInTheDocument();
  });

  it('translates the signed-in navigation and role, and switches back to English', async () => {
    mockApi({ 'GET /me': { body: makeUser(Role.SYSTEM_ADMIN) }, 'GET /admin/dashboard/summary': { status: 500, body: {} } });
    renderApp('/dashboard', { signedIn: true });
    const user = userEvent.setup();
    expect(await screen.findByRole('link', { name: 'Users' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'ไทย' }));
    expect(await screen.findByRole('link', { name: 'ผู้ใช้งาน' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ภาพรวม' })).toBeInTheDocument();
    expect(screen.getByText('ผู้ดูแลระบบ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ออกจากระบบ' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'English' }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument());
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('Thai form validation', () => {
  it('shows the geofence radius and reason messages in Thai', async () => {
    const m = mockApi({});
    await setLanguage('th');
    const config = {
      version: 3,
      name: 'SIIT Rangsit',
      centerLat: 14.0693,
      centerLng: 100.6035,
      radiusM: 150,
      zones: [{ name: 'SIIT Rangsit', centerLat: 14.0693, centerLng: 100.6035, radiusM: 150 }],
      gracePeriodSec: 300,
      maxLocationAgeSec: 60,
      maxAccuracyM: 30,
      effectiveAt: '2026-10-01T00:00:00.000Z',
    };
    renderWithClient(createElement(GeofenceForm, { current: config, onSaved: () => undefined }));
    const user = userEvent.setup();
    const radius = screen.getByLabelText(/^รัศมี \(ม\.\)/);
    await user.clear(radius);
    await user.type(radius, '1500');
    await user.click(screen.getByRole('button', { name: 'บันทึกเป็นเวอร์ชันใหม่' }));
    expect(await screen.findByText('รัศมีต้องเป็นจำนวนเต็มระหว่าง 1 ถึง 1000 ม.')).toBeInTheDocument();
    expect(screen.getByText('โปรดระบุเหตุผล')).toBeInTheDocument();
    // the map clamps to the maximum radius and labels it with Thai units
    expect(screen.getByRole('img', { name: /^แผนภาพพื้นที่ลงเวลา: รัศมี 1\.00 กม\./ })).toBeInTheDocument();
    expect(m.calls).toHaveLength(0);
  });
});
