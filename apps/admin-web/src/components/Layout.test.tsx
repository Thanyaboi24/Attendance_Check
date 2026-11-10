import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { Role } from '@attendance/shared';
import { makeUser, mockApi, renderApp } from '../test/utils';

const summary = {
  date: '2026-11-01',
  activeStaff: 1,
  checkedInNow: 0,
  checkedInToday: 0,
  automaticActionsToday: 0,
  manualActionsToday: 0,
  unresolvedRequests: 0,
  pendingCorrections: 0,
  longOpenSessions: 0,
};

async function navLinks() {
  const nav = await screen.findByRole('navigation', { name: 'Main' });
  return within(nav)
    .getAllByRole('link')
    .map((a) => a.textContent);
}

describe('Role-based navigation', () => {
  it('shows attendance pages to an Attendance Administrator but not user management', async () => {
    mockApi({ 'GET /me': { body: makeUser(Role.ATTENDANCE_ADMIN) }, 'GET /admin/dashboard/summary': { body: summary } });
    renderApp('/dashboard', { signedIn: true });
    expect(await navLinks()).toEqual([
      'Dashboard',
      'Attendance sessions',
      'Attendance requests',
      'Corrections',
      'Reports',
      'Geofence',
      'Audit log',
    ]);
  });

  it('shows users and geofence to a System Administrator but no attendance review pages', async () => {
    mockApi({ 'GET /me': { body: makeUser(Role.SYSTEM_ADMIN) }, 'GET /admin/dashboard/summary': { body: summary } });
    renderApp('/dashboard', { signedIn: true });
    const links = await navLinks();
    expect(links).toEqual(['Dashboard', 'Reports', 'Users', 'Geofence', 'Audit log']);
    expect(links).not.toContain('Attendance sessions');
  });

  it('blocks a route the role cannot use without calling the API', async () => {
    const m = mockApi({ 'GET /me': { body: makeUser(Role.SYSTEM_ADMIN) } });
    renderApp('/sessions', { signedIn: true });
    expect(await screen.findByRole('heading', { name: 'Not available for your role' })).toBeInTheDocument();
    expect(m.find('GET', '/admin/attendance/sessions')).toHaveLength(0);
  });

  it('handles a 403 from the API gracefully', async () => {
    mockApi({
      'GET /me': { body: makeUser(Role.ATTENDANCE_ADMIN) },
      'GET /admin/dashboard/summary': { status: 403, body: { code: 'FORBIDDEN', message: 'Forbidden' } },
    });
    renderApp('/dashboard', { signedIn: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('Your role does not have access to this information.');
  });

  it('only offers the evaluation export to a System Administrator', async () => {
    mockApi({ 'GET /me': { body: makeUser(Role.SYSTEM_ADMIN) } });
    renderApp('/reports', { signedIn: true });
    expect(await screen.findByRole('button', { name: 'Download evaluation.csv' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download attendance.csv' })).not.toBeInTheDocument();
  });

  it('redirects to the login page without a session', async () => {
    mockApi({});
    renderApp('/users');
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
