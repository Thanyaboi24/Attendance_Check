import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiRequestError, REFRESH_TOKEN_KEY } from './client';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function setup() {
  let refreshCalls = 0;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (url.endsWith('/auth/refresh')) {
      refreshCalls++;
      const body = JSON.parse(String(init?.body)) as { refreshToken: string };
      if (body.refreshToken !== 'refresh-old') return json(401, { code: 'TOKEN_INVALID', message: 'Invalid token' });
      await new Promise((r) => setTimeout(r, 20));
      return json(200, { accessToken: 'access-new', refreshToken: 'refresh-new', accessTokenExpiresAt: '2030-01-01T00:00:00Z' });
    }
    if (headers.Authorization !== 'Bearer access-new') return json(401, { code: 'TOKEN_INVALID', message: 'Expired' });
    return json(200, { url });
  });
  const client = new ApiClient({ baseUrl: '/api/v1', fetch });
  return { client, fetch, refreshCalls: () => refreshCalls };
}

describe('ApiClient token refresh', () => {
  it('refreshes once for concurrent 401s (single-flight) and retries every request', async () => {
    const { client, fetch, refreshCalls } = setup();
    client.setTokens({ accessToken: 'access-old', refreshToken: 'refresh-old' });

    const results = await Promise.all([
      client.get<{ url: string }>('/admin/a'),
      client.get<{ url: string }>('/admin/b'),
      client.get<{ url: string }>('/admin/c'),
    ]);

    expect(refreshCalls()).toBe(1);
    expect(results.map((r) => r.url)).toEqual(['/api/v1/admin/a', '/api/v1/admin/b', '/api/v1/admin/c']);
    expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-new');
    // 3 failed + 1 refresh + 3 retried
    expect(fetch).toHaveBeenCalledTimes(7);
  });

  it('clears the session and notifies listeners when the refresh is rejected', async () => {
    const { client, refreshCalls } = setup();
    client.setTokens({ accessToken: 'access-old', refreshToken: 'revoked' });
    const lost = vi.fn();
    client.onAuthLost(lost);

    const results = await Promise.allSettled([client.get('/admin/a'), client.get('/admin/b')]);

    expect(refreshCalls()).toBe(1);
    expect(results.every((r) => r.status === 'rejected' && r.reason instanceof ApiRequestError && r.reason.status === 401)).toBe(true);
    expect(lost).toHaveBeenCalled();
    expect(client.getRefreshToken()).toBeNull();
    expect(client.hasAccessToken()).toBe(false);
  });

  it('restores an access token from the stored refresh token before the first call', async () => {
    const { client, refreshCalls } = setup();
    sessionStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-old');
    await expect(client.get<{ url: string }>('/me')).resolves.toEqual({ url: '/api/v1/me' });
    expect(refreshCalls()).toBe(1);
  });

  it('normalises error bodies and network failures', async () => {
    const client = new ApiClient({
      baseUrl: '/api/v1',
      fetch: vi.fn().mockResolvedValueOnce(json(409, { code: 'CORRECTION_NOT_PENDING', message: 'Already reviewed' })).mockRejectedValueOnce(new TypeError('Failed to fetch')),
    });
    await expect(client.post('/x', {}, { auth: false })).rejects.toMatchObject({ status: 409, code: 'CORRECTION_NOT_PENDING', message: 'Already reviewed' });
    await expect(client.post('/x', {}, { auth: false })).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('omits empty query parameters', async () => {
    const fetch = vi.fn(async () => json(200, {}));
    const client = new ApiClient({ baseUrl: '/api/v1/', fetch });
    await client.request('/admin/users', { query: { q: '', role: undefined, page: 2 }, auth: false });
    expect(fetch).toHaveBeenCalledWith('/api/v1/admin/users?page=2', expect.anything());
  });
});
