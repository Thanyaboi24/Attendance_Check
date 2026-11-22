import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Role, type AdminHolidayDto, type HolidayType } from '@attendance/shared';
import { setLanguage } from '../i18n';
import { todayBangkok } from '../lib/format';
import { makeUser, mockApi, renderApp, type MockHandler } from '../test/utils';

/** The page opens on the current Bangkok year, so the fixtures follow the clock. */
const Y = Number(todayBangkok().slice(0, 4));

function holiday(id: string, date: string, nameEn: string, nameTh: string, type: HolidayType, note: string | null = null): AdminHolidayDto {
  return { id, date, nameEn, nameTh, type, note, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
}

const thisYear: AdminHolidayDto[] = [
  holiday('h1', `${Y}-01-01`, "New Year's Day", 'วันขึ้นปีใหม่', 'PUBLIC'),
  holiday('h2', `${Y}-01-02`, 'Special holiday', 'วันหยุดพิเศษ', 'SPECIAL'),
  holiday('h3', `${Y}-12-05`, "King Bhumibol's Birthday", 'วันคล้ายวันพระบรมราชสมภพ ร.9', 'PUBLIC'),
  holiday('h4', `${Y}-12-07`, 'Substitution day', 'วันหยุดชดเชย', 'SUBSTITUTE', 'Preliminary: check the Cabinet announcement'),
];
const nextYear: AdminHolidayDto[] = [holiday('n1', `${Y + 1}-01-01`, "New Year's Day", 'วันขึ้นปีใหม่', 'PUBLIC')];

function open(routes: Record<string, MockHandler | { status?: number; body?: unknown }> = {}) {
  const m = mockApi({
    'GET /me': { body: makeUser(Role.ATTENDANCE_ADMIN) },
    'GET /admin/holidays': (req) => ({ body: Number(req.query.get('year')) === Y + 1 ? nextYear : thisYear }),
    ...routes,
  });
  renderApp('/holidays', { signedIn: true });
  return m;
}

const month = (name: string) => screen.findByRole('region', { name });

afterEach(async () => {
  await setLanguage('en');
  localStorage.clear();
});

describe('Holidays', () => {
  it('lists the current year grouped by month with type badges and notes', async () => {
    const m = open();
    const jan = await month(`January ${Y}`);
    expect(within(jan).getAllByRole('listitem')).toHaveLength(2);
    expect(within(jan).getByText("New Year's Day")).toBeInTheDocument();
    expect(within(jan).getByText('วันขึ้นปีใหม่')).toBeInTheDocument();
    const dec = screen.getByRole('region', { name: `December ${Y}` });
    const row = within(dec).getByText('Substitution day', { selector: 'strong' }).closest('li')!;
    expect(within(row).getByText('Substitution day', { selector: '.badge' })).toHaveClass('badge-violet');
    expect(within(row).getByText('Preliminary: check the Cabinet announcement')).toBeInTheDocument();
    expect(within(row).getByText(/^\w{3} 7 Dec$/)).toBeInTheDocument();
    expect(screen.getByText(`4 holidays in ${Y}`)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent("On these days staff don't need to come in");
    expect(m.find('GET', '/admin/holidays')[0]?.query.get('year')).toBe(String(Y));
  });

  it('switches years', async () => {
    const m = open();
    await month(`January ${Y}`);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Next year' }));
    expect(await screen.findByText(`1 holiday in ${Y + 1}`)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: `December ${Y}` })).not.toBeInTheDocument();
    expect(m.find('GET', '/admin/holidays').map((c) => c.query.get('year'))).toContain(String(Y + 1));
    await user.click(screen.getByRole('button', { name: 'This year' }));
    expect(await screen.findByText(`4 holidays in ${Y}`)).toBeInTheDocument();
  });

  it('validates and adds a holiday', async () => {
    const created = holiday('h9', `${Y}-12-30`, 'University closure', 'วันหยุดของมหาวิทยาลัย', 'UNIVERSITY');
    const m = open({ 'POST /admin/holidays': { status: 201, body: created } });
    await month(`January ${Y}`);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add holiday' }));
    const dialog = screen.getByRole('dialog', { name: 'Add holiday' });
    await user.click(within(dialog).getByRole('button', { name: 'Add holiday' }));
    expect(await within(dialog).findByText('Choose a date')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter the English name')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter the Thai name')).toBeInTheDocument();
    expect(m.find('POST', '/admin/holidays')).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/^Date/), `${Y}-12-30`);
    await user.type(within(dialog).getByLabelText(/^English name/), 'University closure');
    await user.type(within(dialog).getByLabelText(/^Thai name/), 'วันหยุดของมหาวิทยาลัย');
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'University holiday');
    await user.click(within(dialog).getByRole('button', { name: 'Add holiday' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Added “University closure” on');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(m.find('POST', '/admin/holidays')[0]?.body).toEqual({
      date: `${Y}-12-30`,
      nameEn: 'University closure',
      nameTh: 'วันหยุดของมหาวิทยาลัย',
      type: 'UNIVERSITY',
    });
    await waitFor(() => expect(m.find('GET', '/admin/holidays').length).toBeGreaterThan(1)); // list refreshed
  });

  it('names the existing holiday when the date is already taken', async () => {
    open({
      'POST /admin/holidays': {
        status: 409,
        body: {
          code: 'HOLIDAY_EXISTS',
          message: 'There is already a holiday on this date',
          details: { holiday: { ...thisYear[2], createdAt: undefined, updatedAt: undefined } },
        },
      },
    });
    await month(`January ${Y}`);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add holiday' }));
    const dialog = screen.getByRole('dialog', { name: 'Add holiday' });
    await user.type(within(dialog).getByLabelText('Date'), `${Y}-12-05`);
    await user.type(within(dialog).getByLabelText('English name'), 'Father’s Day');
    await user.type(within(dialog).getByLabelText('Thai name'), 'วันพ่อแห่งชาติ');
    await user.click(within(dialog).getByRole('button', { name: 'Add holiday' }));
    expect(
      await within(dialog).findByText(/^This date already has a holiday: King Bhumibol's Birthday \(\w{3} 5 Dec \d{4}\)\./),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('edits a holiday with the same dialog', async () => {
    const m = open({
      'PATCH /admin/holidays/h4': (req) => ({ body: { ...thisYear[3], ...(req.body as object) } }),
    });
    await month(`December ${Y}`);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit Substitution day' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit holiday' });
    expect(within(dialog).getByLabelText('Date')).toHaveValue(`${Y}-12-07`);
    const name = within(dialog).getByLabelText('English name');
    await user.clear(name);
    await user.type(name, 'Substitution for Father’s Day');
    await user.clear(within(dialog).getByLabelText('Note (optional)'));
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved “Substitution for Father’s Day”.');
    expect(m.find('PATCH', '/admin/holidays/h4')[0]?.body).toEqual({
      date: `${Y}-12-07`,
      type: 'SUBSTITUTE',
      nameEn: 'Substitution for Father’s Day',
      nameTh: 'วันหยุดชดเชย',
      note: '',
    });
  });

  it('deletes a holiday after confirmation', async () => {
    const m = open({ 'DELETE /admin/holidays/h2': { body: { ok: true } } });
    await month(`January ${Y}`);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete Special holiday' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete holiday?' });
    expect(dialog).toHaveTextContent('Check-in will open again on that day.');
    expect(m.find('DELETE', '/admin/holidays/h2')).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Deleted “Special holiday”.');
    expect(m.find('DELETE', '/admin/holidays/h2')).toHaveLength(1);
  });

  it('renders in Thai with Buddhist Era years and Thai names first', async () => {
    open();
    await month(`January ${Y}`);
    await userEvent.setup().click(screen.getByRole('button', { name: 'ไทย' }));
    expect(await screen.findByRole('heading', { name: 'วันหยุด', level: 1 })).toBeInTheDocument();
    const dec = screen.getByRole('region', { name: `ธันวาคม ${Y + 543}` });
    const row = within(dec).getByText('วันหยุดชดเชย', { selector: 'strong' }).closest('li')!;
    expect(within(row).getByText('Substitution day')).toBeInTheDocument();
    expect(within(row).getByText('วันหยุดชดเชย', { selector: '.badge' })).toBeInTheDocument();
    expect(within(row).getByText(/^(อา|จ|อ|พ|พฤ|ศ|ส)\. 7 ธ\.ค\.$/)).toBeInTheDocument();
    expect(screen.getByText(`วันหยุด 4 วันในปี ${Y + 543}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'เพิ่มวันหยุด' })).toBeInTheDocument();
  });

  it('is available to a System Administrator', async () => {
    mockApi({ 'GET /me': { body: makeUser(Role.SYSTEM_ADMIN) }, 'GET /admin/holidays': { body: [] } });
    renderApp('/holidays', { signedIn: true });
    expect(await screen.findByText(`No holidays in ${Y} yet.`)).toBeInTheDocument();
  });
});
