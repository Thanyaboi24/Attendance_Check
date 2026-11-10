import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminSessionDto, CorrectionDto, GeofenceConfig } from '@attendance/shared';
import { api } from '../api/client';
import { mockApi, renderWithClient } from '../test/utils';
import { CorrectionReviewDialog } from './CorrectionsPage';
import { GeofenceForm } from './GeofencePage';
import { SessionEditDialog } from './SessionsPage';

const correction: CorrectionDto = {
  id: 'c1',
  user: { id: 'u1', fullName: 'Somchai Staff', staffId: 'S001', department: 'ICT' },
  sessionId: null,
  workDate: '2026-10-30',
  requestedCheckInAt: '2026-10-30T01:00:00.000Z', // 08:00 Bangkok
  requestedCheckOutAt: '2026-10-30T10:00:00.000Z', // 17:00 Bangkok
  reason: 'Phone battery died',
  status: 'PENDING',
  reviewNote: null,
  reviewer: null,
  reviewedAt: null,
  createdAt: '2026-10-30T12:00:00.000Z',
};

describe('Correction review', () => {
  it('requires a note before rejecting', async () => {
    const m = mockApi({ 'POST /admin/corrections/c1/review': { body: { ...correction, status: 'REJECTED' } } });
    api.setTokens({ accessToken: 'a', refreshToken: 'r' });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithClient(<CorrectionReviewDialog correction={correction} onClose={onClose} />);

    await user.click(screen.getByLabelText('Reject'));
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('A note is required (at least 3 characters)')).toBeInTheDocument();
    expect(m.calls).toHaveLength(0);

    await user.type(screen.getByLabelText('Review note'), 'No evidence of presence');
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(m.find('POST', '/admin/corrections/c1/review')[0]?.body).toEqual({
      decision: 'REJECT',
      note: 'No evidence of presence',
    });
  });

  it('approves with adjusted Bangkok times converted to UTC', async () => {
    const m = mockApi({ 'POST /admin/corrections/c1/review': { body: { ...correction, status: 'APPROVED' } } });
    api.setTokens({ accessToken: 'a', refreshToken: 'r' });
    const user = userEvent.setup();
    renderWithClient(<CorrectionReviewDialog correction={correction} onClose={() => undefined} />);

    fireEvent.change(screen.getByLabelText('Check-in time'), { target: { value: '08:30' } });
    await user.type(screen.getByLabelText('Review note'), 'Confirmed with head of department');
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(m.calls).toHaveLength(1));
    expect(m.calls[0]?.body).toEqual({
      decision: 'APPROVE',
      note: 'Confirmed with head of department',
      checkInAt: '2026-10-30T01:30:00.000Z',
      checkOutAt: '2026-10-30T10:00:00.000Z',
    });
  });
});

const session: AdminSessionDto = {
  id: 's1',
  checkInAt: '2026-10-30T02:05:00.000Z', // 09:05 Bangkok
  checkInMethod: 'AUTOMATIC',
  checkOutAt: null,
  checkOutMethod: null,
  status: 'OPEN',
  corrected: false,
  user: { id: 'u1', staffId: 'S001', fullName: 'Somchai Staff', department: 'ICT' },
};

describe('Session edit', () => {
  it('shows existing times in Bangkok time and sends the edited times as UTC', async () => {
    const m = mockApi({ 'PATCH /admin/attendance/sessions/s1': { body: { ...session, corrected: true } } });
    api.setTokens({ accessToken: 'a', refreshToken: 'r' });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithClient(<SessionEditDialog session={session} onClose={onClose} />);

    expect(screen.getByLabelText('Check-in date')).toHaveValue('2026-10-30');
    expect(screen.getByLabelText('Check-in time')).toHaveValue('09:05');

    fireEvent.change(screen.getByLabelText('Check-in time'), { target: { value: '08:15' } });
    fireEvent.change(screen.getByLabelText('Check-out date'), { target: { value: '2026-10-30' } });
    fireEvent.change(screen.getByLabelText('Check-out time'), { target: { value: '17:45' } });

    // reason is mandatory
    await user.click(screen.getByRole('button', { name: 'Save correction' }));
    expect(await screen.findByText(/A reason is required/)).toBeInTheDocument();
    expect(m.calls).toHaveLength(0);

    await user.type(screen.getByLabelText('Reason'), 'Forgot to check out; confirmed by CCTV');
    await user.click(screen.getByRole('button', { name: 'Save correction' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(m.find('PATCH', '/admin/attendance/sessions/s1')[0]?.body).toEqual({
      checkInAt: '2026-10-30T01:15:00.000Z',
      checkOutAt: '2026-10-30T10:45:00.000Z',
      reason: 'Forgot to check out; confirmed by CCTV',
    });
  });

  it('rejects a check-out before the check-in', async () => {
    const m = mockApi({});
    const user = userEvent.setup();
    renderWithClient(<SessionEditDialog session={session} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Check-out date'), { target: { value: '2026-10-30' } });
    fireEvent.change(screen.getByLabelText('Check-out time'), { target: { value: '07:00' } });
    await user.type(screen.getByLabelText('Reason'), 'Typo fix');
    await user.click(screen.getByRole('button', { name: 'Save correction' }));
    expect(await screen.findByText('Check-out cannot be before check-in')).toBeInTheDocument();
    expect(m.calls).toHaveLength(0);
  });
});

const config: GeofenceConfig = {
  version: 3,
  name: 'SIIT Rangsit',
  centerLat: 14.0693,
  centerLng: 100.6035,
  radiusM: 150,
  gracePeriodSec: 300,
  maxLocationAgeSec: 60,
  maxAccuracyM: 30,
  effectiveAt: '2026-10-01T00:00:00.000Z',
};

describe('Geofence form', () => {
  it('enforces radius bounds and a mandatory reason, then PUTs a new version', async () => {
    const m = mockApi({ 'PUT /admin/geofence/config': { body: { ...config, version: 4, radiusM: 200 } } });
    api.setTokens({ accessToken: 'a', refreshToken: 'r' });
    const onSaved = vi.fn();
    const user = userEvent.setup();
    renderWithClient(<GeofenceForm current={config} onSaved={onSaved} />);

    expect(screen.getByText(/Pending attendance requests keep the version/)).toBeInTheDocument();
    const radius = screen.getByLabelText(/^Radius \(m\)/);
    await user.clear(radius);
    await user.type(radius, '1500');
    await user.click(screen.getByRole('button', { name: 'Save as new version' }));
    expect(await screen.findByText('Radius must be a whole number between 1 and 1000 m')).toBeInTheDocument();
    expect(await screen.findByText('A reason is required')).toBeInTheDocument();
    expect(m.calls).toHaveLength(0);

    await user.clear(radius);
    await user.type(radius, '0');
    await user.click(screen.getByRole('button', { name: 'Save as new version' }));
    expect(await screen.findByText('Radius must be a whole number between 1 and 1000 m')).toBeInTheDocument();

    // the slider and the numeric input stay in sync
    fireEvent.change(screen.getByLabelText('Radius slider'), { target: { value: '200' } });
    expect(radius).toHaveValue(200);
    await waitFor(() => expect(screen.queryByText(/Radius must be/)).not.toBeInTheDocument());

    await user.type(screen.getByLabelText(/Reason for the change/), 'Include the new library building');
    await user.click(screen.getByRole('button', { name: 'Save as new version' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(m.find('PUT', '/admin/geofence/config')[0]?.body).toEqual({
      name: 'SIIT Rangsit',
      centerLat: 14.0693,
      centerLng: 100.6035,
      radiusM: 200,
      gracePeriodSec: 300,
      maxLocationAgeSec: 60,
      maxAccuracyM: 30,
      reason: 'Include the new library building',
    });
  });

  it('renders the key-less map fallback', () => {
    mockApi({});
    renderWithClient(<GeofenceForm current={config} onSaved={() => undefined} />);
    expect(screen.getByRole('img', { name: /Geofence plot: radius 150 m/ })).toBeInTheDocument();
  });
});
