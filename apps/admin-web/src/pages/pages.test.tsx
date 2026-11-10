import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Role, type AdminRequestDetail } from '@attendance/shared';
import { makeUser, mockApi, renderApp } from '../test/utils';

const detail: AdminRequestDetail = {
  id: 'r1',
  type: 'CHECK_IN',
  status: 'UNRESOLVED',
  method: null,
  sessionId: null,
  configVersion: 2,
  geofenceDetectedAt: '2026-10-30T01:00:00.000Z',
  notificationStatus: 'POSTED',
  notificationPostedAt: '2026-10-30T01:00:05.000Z',
  deadlineAt: '2026-10-30T01:05:05.000Z',
  approvedAt: null,
  resolutionReason: 'UNCERTAIN_LOCATION',
  createdAt: '2026-10-30T01:00:06.000Z',
  user: { id: 'u1', staffId: 'S001', fullName: 'Somchai Staff', department: 'ICT' },
  evidence: [
    {
      id: 'e1',
      stage: 'AUTO',
      lat: 14.0705,
      lng: 100.6035,
      measuredAt: '2026-10-30T01:05:10.000Z',
      accuracyM: 45,
      isMock: false,
      distanceM: 133,
      classification: 'UNCERTAIN',
      clientClassification: 'UNCERTAIN',
      receivedAt: '2026-10-30T01:05:12.000Z',
    },
  ],
  device: { model: 'Pixel 8', os: 'Android 15', appVersion: '1.0.0' },
  userConfirmedAt: null,
  clientRecordedAt: '2026-10-30T01:05:11.000Z',
  config: { version: 2, centerLat: 14.0693, centerLng: 100.6035, radiusM: 150, maxLocationAgeSec: 60, maxAccuracyM: 30 },
};

describe('Request detail', () => {
  it('shows Bangkok timestamps, device, evidence and the geofence plot of the request’s config version', async () => {
    mockApi({ 'GET /me': { body: makeUser(Role.ATTENDANCE_ADMIN) }, 'GET /admin/attendance/requests/r1': { body: detail } });
    renderApp('/requests/r1', { signedIn: true });
    expect(await screen.findByText('Somchai Staff')).toBeInTheDocument();
    expect(screen.getAllByText('2026-10-30 08:00').length).toBeGreaterThan(0); // detected (01:00Z), Bangkok
    expect(screen.getAllByText('2026-10-30 08:05').length).toBeGreaterThan(1); // deadline + evidence
    expect(screen.getByText('Pixel 8 · Android 15 · app 1.0.0')).toBeInTheDocument();
    expect(screen.getByText('133 m')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Geofence plot: radius 150 m, 1 evidence point(s)' })).toBeInTheDocument();
  });
});

describe('Activation page', () => {
  it('sets the password with the token from the link', async () => {
    const m = mockApi({ 'POST /auth/activate': { body: { ok: true } } });
    const token = 'a'.repeat(32);
    renderApp(`/activate?token=${token}`);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('New password'), 'Secret123');
    await user.type(screen.getByLabelText('Confirm password'), 'Secret123');
    await user.click(screen.getByRole('button', { name: 'Activate account' }));
    expect(await screen.findByText(/Your account is active/)).toBeInTheDocument();
    await waitFor(() => expect(m.find('POST', '/auth/activate')[0]?.body).toEqual({ token, password: 'Secret123' }));
  });

  it('explains an invalid link', async () => {
    mockApi({});
    renderApp('/reset-password');
    expect(await screen.findByText(/reset link is invalid or has expired/)).toBeInTheDocument();
  });
});
