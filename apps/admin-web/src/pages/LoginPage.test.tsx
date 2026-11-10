import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Role } from '@attendance/shared';
import { api, REFRESH_TOKEN_KEY } from '../api/client';
import { STAFF_NOT_ALLOWED } from '../auth/AuthContext';
import { makeUser, mockApi, renderApp } from '../test/utils';

const tokens = { accessToken: 'acc', refreshToken: 'ref', accessTokenExpiresAt: '2030-01-01T00:00:00Z' };
const summary = {
  date: '2026-11-01',
  activeStaff: 42,
  checkedInNow: 10,
  checkedInToday: 30,
  automaticActionsToday: 12,
  manualActionsToday: 18,
  unresolvedRequests: 3,
  pendingCorrections: 2,
  longOpenSessions: 1,
};

async function submit(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('Login', () => {
  it('rejects a STAFF account with a pointer to the mobile app and keeps no session', async () => {
    const m = mockApi({
      'POST /auth/login': { body: { tokens, user: makeUser(Role.STAFF) } },
      'POST /auth/logout': { body: { ok: true } },
    });
    renderApp('/login');
    await submit('staff@siit.tu.ac.th', 'Staff1234');

    expect(await screen.findByText(STAFF_NOT_ALLOWED)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(api.hasAccessToken()).toBe(false);
    // the issued refresh token is revoked
    await waitFor(() => expect(m.find('POST', '/auth/logout')[0]?.body).toEqual({ refreshToken: 'ref' }));
  });

  it('lets an administrator in and shows the dashboard', async () => {
    const m = mockApi({
      'POST /auth/login': { body: { tokens, user: makeUser(Role.ATTENDANCE_ADMIN) } },
      'GET /admin/dashboard/summary': { body: summary },
    });
    renderApp('/login');
    await submit('Attendance.Admin@siit.tu.ac.th ', 'Admin1234');

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(m.find('POST', '/auth/login')[0]?.body).toEqual({ email: 'attendance.admin@siit.tu.ac.th', password: 'Admin1234' });
    expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBe('ref');
    expect(m.find('GET', '/admin/dashboard/summary')[0]?.headers.Authorization).toBe('Bearer acc');
  });

  it('shows a generic message on 401', async () => {
    mockApi({
      'POST /auth/login': { status: 401, body: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } },
    });
    renderApp('/login');
    await submit('nobody@siit.tu.ac.th', 'wrong-pass1');
    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
  });

  it('shows the lockout message on 423', async () => {
    mockApi({
      'POST /auth/login': { status: 423, body: { code: 'ACCOUNT_LOCKED', message: 'Locked' } },
    });
    renderApp('/login');
    await submit('attendance.admin@siit.tu.ac.th', 'wrong-pass1');
    expect(await screen.findByText(/temporarily locked/i)).toBeInTheDocument();
  });

  it('validates the email format before calling the API', async () => {
    const m = mockApi({});
    renderApp('/login');
    await submit('not-an-email', 'x');
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(m.calls).toHaveLength(0);
  });
});
