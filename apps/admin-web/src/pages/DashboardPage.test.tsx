import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays, Role, type CorrectionDto, type DashboardSummary, type HolidayDto } from '@attendance/shared';
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

const correction: CorrectionDto = {
  id: 'c1',
  user: { id: 'u1', fullName: 'Somchai Jaidee', staffId: 'S001', department: 'ICT' },
  sessionId: null,
  workDate: '2026-11-13',
  requestedCheckInAt: '2026-11-13T01:30:00.000Z', // 08:30 Bangkok
  requestedCheckOutAt: '2026-11-13T10:00:00.000Z', // 17:00 Bangkok
  reason: 'Phone battery died before I left campus',
  status: 'PENDING',
  reviewNote: null,
  reviewer: null,
  reviewedAt: null,
  createdAt: '2026-11-13T12:00:00.000Z',
};

function open(role: Role, summary = base, holidays?: (from: string) => HolidayDto[], corrections: CorrectionDto[] = []) {
  const api = mockApi({
    'GET /me': { body: makeUser(role) },
    'GET /admin/dashboard/summary': { body: summary },
    'GET /admin/corrections': { body: { items: corrections, total: corrections.length, page: 1, pageSize: 5 } },
    'POST /admin/corrections/c1/review': (req) => ({ body: { ...correction, status: (req.body as { decision: string }).decision === 'APPROVE' ? 'APPROVED' : 'REJECTED' } }),
    ...(holidays ? { 'GET /calendar/holidays': (req) => ({ body: { holidays: holidays(req.query.get('from')!) } }) } : {}),
  });
  renderApp('/dashboard', { signedIn: true });
  return api;
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

  describe('pending corrections', () => {
    it('lists requests awaiting a decision and approves one from the dashboard', async () => {
      const api = open(Role.ATTENDANCE_ADMIN, { ...base, pendingCorrections: 1 }, undefined, [correction]);
      const panel = await screen.findByRole('region', { name: /Pending corrections/ });
      expect(within(panel).getByText('Awaiting a decision')).toBeInTheDocument();
      expect(await within(panel).findByText('Somchai Jaidee')).toBeInTheDocument();
      expect(within(panel).getByText('Phone battery died before I left campus')).toBeInTheDocument();
      expect(within(panel).getByText('08:30')).toBeInTheDocument();
      expect(within(panel).getByText('17:00')).toBeInTheDocument();
      expect(api.find('GET', '/admin/corrections')[0]!.query.get('status')).toBe('PENDING');

      const user = userEvent.setup();
      await user.click(within(panel).getByRole('button', { name: 'Approve the correction from Somchai Jaidee' }));
      const dialog = await screen.findByRole('dialog', { name: 'Review correction' });
      expect(within(dialog).getByRole('radio', { name: 'Approve' })).toBeChecked();
      await user.type(within(dialog).getByRole('textbox', { name: 'Review note' }), 'Confirmed with the department');
      await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
      await vi.waitFor(() => expect(api.find('POST', '/admin/corrections/c1/review')).toHaveLength(1));
      expect(api.find('POST', '/admin/corrections/c1/review')[0]!.body).toMatchObject({
        decision: 'APPROVE',
        note: 'Confirmed with the department',
        checkInAt: '2026-11-13T01:30:00.000Z',
        checkOutAt: '2026-11-13T10:00:00.000Z',
      });
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('opens the review with Reject selected', async () => {
      const api = open(Role.ATTENDANCE_ADMIN, { ...base, pendingCorrections: 1 }, undefined, [correction]);
      const panel = await screen.findByRole('region', { name: /Pending corrections/ });
      const user = userEvent.setup();
      await user.click(await within(panel).findByRole('button', { name: 'Reject the correction from Somchai Jaidee' }));
      const dialog = await screen.findByRole('dialog', { name: 'Review correction' });
      expect(within(dialog).getByRole('radio', { name: 'Reject' })).toBeChecked();
      await user.type(within(dialog).getByRole('textbox', { name: 'Review note' }), 'No record of you on campus');
      await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
      await vi.waitFor(() => expect(api.find('POST', '/admin/corrections/c1/review')).toHaveLength(1));
      expect(api.find('POST', '/admin/corrections/c1/review')[0]!.body).toEqual({ decision: 'REJECT', note: 'No record of you on campus' });
    });

    it('shows an empty state when nothing is waiting', async () => {
      open(Role.ATTENDANCE_ADMIN);
      const panel = await screen.findByRole('region', { name: /Pending corrections/ });
      expect(await within(panel).findByText('No corrections awaiting a decision')).toBeInTheDocument();
    });

    it('is not shown to a System Administrator, who cannot review corrections', async () => {
      open(Role.SYSTEM_ADMIN);
      await screen.findByRole('region', { name: 'Needs attention' });
      expect(screen.queryByRole('region', { name: /Pending corrections/ })).not.toBeInTheDocument();
    });
  });
});
