import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays, Role, type DashboardSummary, type HolidayDto } from '@attendance/shared';
import { makeUser, mockApi, renderApp } from '../test/utils';

const base: DashboardSummary = {
  date: '2026-11-15',
  activeStaff: 40,
  checkedInNow: 10,
  checkedInToday: 30,
  automaticActionsToday: 12,
  manualActionsToday: 4,
  unresolvedRequests: 3,
  pendingCorrections: 0,
  pendingSignups: 0,
  longOpenSessions: 1,
};

function open(role: Role, summary = base, holidays?: (from: string) => HolidayDto[]) {
  mockApi({
    'GET /me': { body: makeUser(role) },
    'GET /admin/dashboard/summary': { body: summary },
    ...(holidays ? { 'GET /calendar/holidays': (req) => ({ body: { holidays: holidays(req.query.get('from')!) } }) } : {}),
  });
  renderApp('/dashboard', { signedIn: true });
}

describe('Dashboard', () => {
  it('shows presence, today and the automatic/manual split', async () => {
    open(Role.ATTENDANCE_ADMIN);
    expect(await screen.findByRole('img', { name: '10 of 40 active staff are checked in' })).toBeInTheDocument();
    expect(screen.getByText('25% of active staff')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '75% of active staff checked in today' })).toHaveAttribute('aria-valuenow', '75');
    expect(screen.getByText('Sunday, 15 November 2026', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Automatic 12, manual 4' })).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument(); // total actions
  });

  it('links each attention item to its review page for an Attendance Administrator', async () => {
    open(Role.ATTENDANCE_ADMIN);
    const list = await screen.findByRole('region', { name: 'Needs attention' });
    const links = within(list).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/requests', '/corrections', '/sessions', '/signups']);
    expect(within(list).queryByText('All clear')).not.toBeInTheDocument();
  });

  it('shows a System Administrator only the sign-up link, and an all-clear state when nothing waits', async () => {
    open(Role.SYSTEM_ADMIN, { ...base, unresolvedRequests: 0, longOpenSessions: 0 });
    const list = await screen.findByRole('region', { name: 'Needs attention' });
    expect(within(list).getByText('All clear')).toBeInTheDocument();
    expect(within(list).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/signups']);
  });

  it('counts pending sign-ups as needing attention and links them for a System Administrator', async () => {
    open(Role.SYSTEM_ADMIN, { ...base, unresolvedRequests: 0, longOpenSessions: 0, pendingSignups: 2 });
    const list = await screen.findByRole('region', { name: 'Needs attention' });
    expect(within(list).queryByText('All clear')).not.toBeInTheDocument();
    const link = within(list).getByRole('link', { name: /Sign-up requests/ });
    expect(link).toHaveAttribute('href', '/signups');
    expect(link).toHaveTextContent('2');
    expect(link).toHaveTextContent('New staff accounts awaiting approval');
  });

  it('shows an empty activity message before anything is approved', async () => {
    open(Role.ATTENDANCE_ADMIN, { ...base, automaticActionsToday: 0, manualActionsToday: 0 });
    expect(await screen.findByText('No check-ins or check-outs approved yet today.')).toBeInTheDocument();
  });

  it('switches to Thai with a Buddhist Era date', async () => {
    open(Role.ATTENDANCE_ADMIN);
    await screen.findByRole('region', { name: 'Needs attention' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'ไทย' }));
    expect(await screen.findByRole('heading', { name: 'อยู่ในพื้นที่ขณะนี้' })).toBeInTheDocument();
    expect(screen.getByText('2569', { exact: false })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'English' }));
  });

  it('shows when today is a holiday and check-in is closed', async () => {
    open(Role.ATTENDANCE_ADMIN, base, (from) => [
      { id: 'h1', date: from, nameEn: 'Constitution Day', nameTh: 'วันรัฐธรรมนูญ', type: 'PUBLIC', note: null },
    ]);
    const chip = await screen.findByRole('link', { name: 'Today is a holiday: Constitution Day — check-in is closed' });
    expect(chip).toHaveAttribute('href', '/holidays');
  });

  it('shows the next holiday within 30 days', async () => {
    let today = '';
    open(Role.SYSTEM_ADMIN, base, (from) => {
      today = from;
      return [{ id: 'h2', date: addDays(from, 3), nameEn: 'New Year', nameTh: 'วันขึ้นปีใหม่', type: 'PUBLIC', note: null }];
    });
    const chip = await screen.findByRole('link', { name: /^Next holiday: New Year, .+ \(in 3 days\)$/ });
    expect(chip).toHaveAttribute('href', '/holidays');
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
