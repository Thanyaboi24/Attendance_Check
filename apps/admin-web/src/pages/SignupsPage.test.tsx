import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Role, type AdminUserDto, type Paginated, type SignupDto } from '@attendance/shared';
import { setLanguage } from '../i18n';
import { makeUser, mockApi, renderApp, type MockHandler } from '../test/utils';

const signup: SignupDto = {
  id: 'su-1',
  staffId: 'S100',
  email: 'nida@siit.tu.ac.th',
  fullName: 'Nida Newcomer',
  department: 'Library',
  role: 'STAFF',
  status: 'PENDING_APPROVAL',
  createdAt: '2026-11-14T02:30:00.000Z', // 09:30 Bangkok
  lastLoginAt: null,
  reviewedAt: null,
  reviewedBy: null,
  reviewNote: null,
};

const page = (items: SignupDto[]): Paginated<SignupDto> => ({ items, page: 1, pageSize: 25, total: items.length });

function open(routes: Record<string, MockHandler | { status?: number; body?: unknown }>, role: Role = Role.ATTENDANCE_ADMIN) {
  const m = mockApi({ 'GET /me': { body: makeUser(role) }, ...routes });
  renderApp('/signups', { signedIn: true });
  return m;
}

afterEach(async () => {
  await setLanguage('en');
  localStorage.clear();
});

describe('Sign-up requests', () => {
  it('lists pending sign-ups by default', async () => {
    const m = open({ 'GET /admin/signups': { body: page([signup]) } });
    const row = (await screen.findByText('Nida Newcomer')).closest('tr')!;
    expect(within(row).getByText('S100')).toBeInTheDocument();
    expect(within(row).getByText('nida@siit.tu.ac.th')).toBeInTheDocument();
    expect(within(row).getByText('Library')).toBeInTheDocument();
    expect(within(row).getByText('2026-11-14 09:30')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pending' })).toHaveAttribute('aria-selected', 'true');
    expect(m.find('GET', '/admin/signups')[0]?.query.get('status')).toBe('PENDING_APPROVAL');
  });

  it('is available to a System Administrator too', async () => {
    open({ 'GET /admin/signups': { body: page([signup]) } }, Role.SYSTEM_ADMIN);
    expect(await screen.findByText('Nida Newcomer')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sign-up requests' })).toBeInTheDocument();
  });

  it('shows an empty state when nothing is waiting', async () => {
    open({ 'GET /admin/signups': { body: page([]) } });
    expect(await screen.findByText('No sign-up requests are waiting for approval.')).toBeInTheDocument();
  });

  it('shows reviewer, time and reason on the Rejected tab', async () => {
    const rejected: SignupDto = {
      ...signup,
      status: 'REJECTED',
      reviewedAt: '2026-11-14T08:00:00.000Z',
      reviewedBy: { id: 'a1', fullName: 'Anna Attendance' },
      reviewNote: 'Not a member of staff',
    };
    const m = open({
      'GET /admin/signups': (req) => ({ body: page(req.query.get('status') === 'REJECTED' ? [rejected] : []) }),
    });
    await screen.findByText('No sign-up requests are waiting for approval.');
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Rejected' }));
    const row = (await screen.findByText('Nida Newcomer')).closest('tr')!;
    expect(within(row).getByText('Anna Attendance')).toBeInTheDocument();
    expect(within(row).getByText('2026-11-14 15:00')).toBeInTheDocument();
    expect(within(row).getByText('Not a member of staff')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Reason' })).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    expect(m.find('GET', '/admin/signups').at(-1)?.query.get('status')).toBe('REJECTED');
  });

  it('approves with an optional note, then refreshes the list', async () => {
    let reviewed = false;
    const m = open({
      'GET /admin/signups': () => ({ body: page(reviewed ? [] : [signup]) }),
      'POST /admin/signups/su-1/approve': () => {
        reviewed = true;
        return { body: { ...signup, status: 'ACTIVE' } };
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Approve Nida Newcomer' }));
    const dialog = screen.getByRole('dialog', { name: 'Approve sign-up request?' });
    await user.type(within(dialog).getByLabelText('Note to the staff member (optional)'), 'Welcome aboard');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('Approved the sign-up request of Nida Newcomer.')).toBeInTheDocument();
    expect(m.find('POST', '/admin/signups/su-1/approve')[0]?.body).toEqual({ note: 'Welcome aboard' });
    expect(await screen.findByText('No sign-up requests are waiting for approval.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('approves without a note by sending an empty body', async () => {
    const m = open({
      'GET /admin/signups': { body: page([signup]) },
      'POST /admin/signups/su-1/approve': { body: { ...signup, status: 'ACTIVE' } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Approve Nida Newcomer' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(m.find('POST', '/admin/signups/su-1/approve')).toHaveLength(1));
    expect(m.find('POST', '/admin/signups/su-1/approve')[0]?.body).toEqual({});
  });

  it('requires a reason before rejecting, then sends it', async () => {
    const m = open({
      'GET /admin/signups': { body: page([signup]) },
      'POST /admin/signups/su-1/reject': { body: { ...signup, status: 'REJECTED' } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Reject Nida Newcomer' }));
    const dialog = screen.getByRole('dialog', { name: 'Reject sign-up request' });
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(await within(dialog).findByText('Enter a reason')).toBeInTheDocument();
    expect(m.find('POST', '/admin/signups/su-1/reject')).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/^Reason/), '  Unknown department  ');
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Rejected the sign-up request of Nida Newcomer.')).toBeInTheDocument();
    expect(m.find('POST', '/admin/signups/su-1/reject')[0]?.body).toEqual({ reason: 'Unknown department' });
  });

  it('explains and refreshes when another administrator already reviewed the request (409)', async () => {
    const m = open({
      'GET /admin/signups': { body: page([signup]) },
      'POST /admin/signups/su-1/approve': {
        status: 409,
        body: { code: 'SIGNUP_NOT_PENDING', message: 'This sign-up request has already been reviewed' },
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Approve Nida Newcomer' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve' }));

    expect(
      await screen.findByText(
        'The sign-up request of Nida Newcomer has already been reviewed by another administrator. The list was refreshed.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(m.find('GET', '/admin/signups').length).toBeGreaterThanOrEqual(2));
  });

  it('renders in Thai', async () => {
    await setLanguage('th');
    open({ 'GET /admin/signups': { body: page([signup]) } });
    expect(await screen.findByRole('heading', { name: 'คำขอลงทะเบียน' })).toBeInTheDocument();
    await screen.findByText('Nida Newcomer');
    expect(screen.getByRole('tab', { name: 'รออนุมัติ' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('columnheader', { name: 'ส่งเมื่อ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'อนุมัติ Nida Newcomer' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'ไม่อนุมัติ Nida Newcomer' }));
    await userEvent.setup().click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ไม่อนุมัติ' }));
    expect(await screen.findByText('โปรดระบุเหตุผล')).toBeInTheDocument();
  });
});

describe('Users page and sign-ups', () => {
  it('points pending and rejected sign-ups to the Sign-up requests page instead of offering status changes', async () => {
    const users: AdminUserDto[] = [
      { ...signup, id: 'u1', fullName: 'Pending Person', status: 'PENDING_APPROVAL' },
      { ...signup, id: 'u2', fullName: 'Rejected Person', status: 'REJECTED' },
      { ...signup, id: 'u3', fullName: 'Active Person', status: 'ACTIVE' },
    ];
    mockApi({
      'GET /me': { body: makeUser(Role.SYSTEM_ADMIN) },
      'GET /admin/users': { body: { items: users, page: 1, pageSize: 25, total: 3 } },
    });
    renderApp('/users', { signedIn: true });
    for (const name of ['Pending Person', 'Rejected Person']) {
      const row = (await screen.findByText(name)).closest('tr')!;
      expect(within(row).getByRole('link', { name: 'Sign-up requests' })).toHaveAttribute('href', '/signups');
      expect(within(row).queryByRole('button', { name: /Activate|Deactivate/ })).not.toBeInTheDocument();
    }
    expect(within(screen.getByText('Pending Person').closest('tr')!).getByText('Pending approval')).toBeInTheDocument();
    expect(within(screen.getByText('Rejected Person').closest('tr')!).getByText('Rejected')).toBeInTheDocument();
    const active = screen.getByText('Active Person').closest('tr')!;
    expect(within(active).getByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
  });
});
