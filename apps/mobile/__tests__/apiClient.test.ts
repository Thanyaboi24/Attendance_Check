import type { TokenPair } from '@attendance/shared';
import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { createHttpClients } from '../src/data/api/client';
import { createAttendanceApi } from '../src/data/api/endpoints';
import { isApiError, isAuthError, isNetworkError } from '../src/domain/errors';

const BASE = 'http://api.test/api/v1';

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown): Promise<AxiosResponse> {
  const response = { data, status, statusText: String(status), headers: {}, config } as AxiosResponse;
  if (status >= 200 && status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError(`HTTP ${status}`, String(status), config, null, response));
}

class MemorySession {
  tokens: TokenPair | null = { accessToken: 'old', refreshToken: 'r1', accessTokenExpiresAt: '2026-01-01T00:00:00Z' };
  cleared = 0;
  async getTokens() {
    return this.tokens;
  }
  async setTokens(t: TokenPair) {
    this.tokens = t;
  }
  async clear() {
    this.tokens = null;
    this.cleared++;
  }
}

const STATE = {
  state: 'CHECKED_OUT',
  openSession: null,
  activeRequest: null,
  todaySessions: [],
  activeConfigVersion: 1,
  serverTime: '2026-11-03T01:00:00.000Z',
};

/** Fake server: accepts only the "new" access token; /auth/refresh rotates r1 → r2 once. */
function makeServer(opts: { refreshFails?: boolean } = {}) {
  const log: Array<{ url: string; auth?: string; idem?: string }> = [];
  let refreshCalls = 0;
  const adapter: AxiosAdapter = async (config) => {
    const url = config.url ?? '';
    const auth = config.headers?.get?.('Authorization') as string | undefined;
    const idem = config.headers?.get?.('Idempotency-Key') as string | undefined;
    log.push({ url, auth, idem });
    await new Promise((r) => setTimeout(r, 5));
    if (url === '/auth/refresh') {
      refreshCalls++;
      const body = JSON.parse(String(config.data)) as { refreshToken: string };
      if (opts.refreshFails || body.refreshToken !== 'r1') return respond(config, 401, { code: 'TOKEN_INVALID', message: 'invalid' });
      return respond(config, 200, { accessToken: 'new', refreshToken: 'r2', accessTokenExpiresAt: '2026-11-03T01:15:00Z' });
    }
    if (auth !== 'Bearer new') return respond(config, 401, { code: 'TOKEN_INVALID', message: 'expired' });
    if (url === '/attendance/state') return respond(config, 200, STATE);
    if (url.endsWith('/confirm')) return respond(config, 422, { code: 'LOCATION_NOT_CONFIRMED', message: 'nope', details: { classification: 'UNCERTAIN' } });
    if (url === '/geofence/config/active') return respond(config, 200, { version: 'bad' });
    return respond(config, 404, { code: 'NOT_FOUND', message: 'not found' });
  };
  return { adapter, log, refreshCalls: () => refreshCalls };
}

describe('API client', () => {
  it('refreshes once for concurrent 401s (single-flight) and retries every request with the new token', async () => {
    const server = makeServer();
    const session = new MemorySession();
    const { http } = createHttpClients({ baseURL: BASE, session, adapter: server.adapter });
    const api = createAttendanceApi(http);

    const results = await Promise.all([api.getState(), api.getState(), api.getState()]);
    expect(results.every((r) => r.state === 'CHECKED_OUT')).toBe(true);
    expect(server.refreshCalls()).toBe(1);
    expect(session.tokens).toMatchObject({ accessToken: 'new', refreshToken: 'r2' });
    expect(server.log.filter((l) => l.url === '/attendance/state' && l.auth === 'Bearer new')).toHaveLength(3);
  });

  it('refresh rejected → tokens cleared, onAuthLost called, AuthRequiredError (retryable for the outbox)', async () => {
    const server = makeServer({ refreshFails: true });
    const session = new MemorySession();
    const onAuthLost = jest.fn();
    const { http } = createHttpClients({ baseURL: BASE, session, adapter: server.adapter, onAuthLost });
    const api = createAttendanceApi(http);
    const errors = await Promise.all([api.getState().catch((e) => e), api.getState().catch((e) => e)]);
    expect(errors.every(isAuthError)).toBe(true);
    expect(server.refreshCalls()).toBe(1);
    expect(session.tokens).toBeNull();
    expect(onAuthLost).toHaveBeenCalledTimes(1);
  });

  it('sends Idempotency-Key = request id and maps ApiError bodies (422 with details)', async () => {
    const server = makeServer();
    const session = new MemorySession();
    session.tokens = { accessToken: 'new', refreshToken: 'r1', accessTokenExpiresAt: '' };
    const { http } = createHttpClients({ baseURL: BASE, session, adapter: server.adapter });
    const api = createAttendanceApi(http);
    const id = '6f1c2a7e-0b7d-4a35-9c2e-1d8f0e5b3a11';
    const err = await api
      .confirm(id, {
        userConfirmedAt: '2026-11-03T01:00:00Z',
        clientRecordedAt: '2026-11-03T01:00:00Z',
        evidence: { lat: 14, lng: 100, measuredAt: '2026-11-03T01:00:00Z', accuracyM: 5 },
      })
      .catch((e) => e);
    expect(isApiError(err)).toBe(true);
    expect(err).toMatchObject({ status: 422, code: 'LOCATION_NOT_CONFIRMED', details: { classification: 'UNCERTAIN' } });
    expect(server.log.at(-1)).toMatchObject({ url: `/attendance/requests/${id}/confirm`, idem: id });
  });

  it('rejects responses that do not match the zod contract', async () => {
    const server = makeServer();
    const session = new MemorySession();
    session.tokens = { accessToken: 'new', refreshToken: 'r1', accessTokenExpiresAt: '' };
    const api = createAttendanceApi(createHttpClients({ baseURL: BASE, session, adapter: server.adapter }).http);
    await expect(api.getActiveConfig()).rejects.toMatchObject({ kind: 'contract' });
  });

  it('maps a missing response to NetworkError', async () => {
    const session = new MemorySession();
    const adapter: AxiosAdapter = async (config) => {
      throw new AxiosError('Network Error', 'ERR_NETWORK', config);
    };
    const api = createAttendanceApi(createHttpClients({ baseURL: BASE, session, adapter }).http);
    const err = await api.getState().catch((e) => e);
    expect(isNetworkError(err)).toBe(true);
  });
});
