import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { Role, type UserProfile } from '@attendance/shared';
import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthContext';
import { AppRoutes } from '../App';

export interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
}
export interface MockResponse {
  status?: number;
  body?: unknown;
  text?: string;
  headers?: Record<string, string>;
}
export type MockHandler = (req: MockRequest) => MockResponse | Promise<MockResponse>;

/** Stubs global fetch with handlers keyed by "METHOD /path" (path relative to /api/v1). */
export function mockApi(routes: Record<string, MockHandler | MockResponse>) {
  const calls: MockRequest[] = [];
  const fn = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const req: MockRequest = {
      method,
      path,
      query: url.searchParams,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(req);
    const route = routes[`${method} ${path}`];
    const res: MockResponse = route
      ? typeof route === 'function'
        ? await route(req)
        : route
      : { status: 404, body: { code: 'NOT_FOUND', message: `No mock for ${method} ${path}` } };
    const text = res.text ?? (res.body === undefined ? '' : JSON.stringify(res.body));
    return new Response(text, {
      status: res.status ?? 200,
      headers: { 'content-type': 'application/json', ...res.headers },
    });
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls, find: (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path) };
}

export function makeUser(role: Role, overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: `u-${role}`,
    staffId: 'S001',
    email: `${role.toLowerCase()}@siit.tu.ac.th`,
    fullName: role === Role.STAFF ? 'Somchai Staff' : role === Role.SYSTEM_ADMIN ? 'Sara System' : 'Anna Attendance',
    department: 'ICT',
    role,
    status: 'ACTIVE',
    ...overrides,
  };
}

export function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

/** Renders the whole app at `route`; with `user`, the session is pre-established (GET /me must be mocked). */
export function renderApp(route: string, opts: { signedIn?: boolean } = {}) {
  api.clearTokens();
  if (opts.signedIn) api.setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  const qc = newQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Renders a component with query client + router only (no auth). */
export function renderWithClient(ui: ReactElement) {
  const qc = newQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
