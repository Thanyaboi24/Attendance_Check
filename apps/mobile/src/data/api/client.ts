import { ApiErrorSchema, type TokenPair, TokenPairSchema } from '@attendance/shared';
import axios, { type AxiosAdapter, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { ApiRequestError, AuthRequiredError, ContractError, NetworkError } from '../../domain/errors';

/** What the HTTP client needs from the session store. */
export interface TokenSource {
  getTokens(): Promise<TokenPair | null>;
  setTokens(tokens: TokenPair): Promise<void>;
  clear(): Promise<void>;
}

export interface HttpClientOptions {
  baseURL: string;
  session: TokenSource;
  /** Called once the refresh token is rejected (UI → sign-in screen). */
  onAuthLost?: () => void;
  /** Test seam (and custom transports). */
  adapter?: AxiosAdapter;
  timeoutMs?: number;
}

export interface HttpClients {
  /** Authenticated API: Bearer token, single-flight refresh on 401. */
  http: AxiosInstance;
  /** Public endpoints (login, forgot/reset password, activation, logout). */
  publicHttp: AxiosInstance;
  /** Exposed for tests / diagnostics. */
  refreshTokens(): Promise<TokenPair>;
}

type AuthConfig = InternalAxiosRequestConfig & { _retried?: boolean; _sentAccessToken?: string };

/** Maps axios failures to domain errors (`ApiRequestError` / `NetworkError`). */
export function toDomainError(e: unknown): Error {
  if (e instanceof Error && 'kind' in e) return e; // already a domain error
  if (axios.isAxiosError(e)) {
    const res = e.response;
    if (!res) return new NetworkError(e.message || 'Network unavailable');
    const body = ApiErrorSchema.safeParse(res.data);
    if (body.success) return new ApiRequestError(res.status, body.data.code, body.data.message, body.data.details);
    return new ApiRequestError(res.status, `HTTP_${res.status}`, e.message);
  }
  return e instanceof Error ? e : new Error(String(e));
}

export function createHttpClients(opts: HttpClientOptions): HttpClients {
  const { baseURL, session, onAuthLost, adapter } = opts;
  const timeout = opts.timeoutMs ?? 15_000;
  const common = {
    baseURL,
    timeout,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(adapter ? { adapter } : {}),
  };
  const http = axios.create(common);
  const publicHttp = axios.create(common);

  let refreshing: Promise<TokenPair> | null = null;

  async function doRefresh(): Promise<TokenPair> {
    const current = await session.getTokens();
    if (!current) throw new AuthRequiredError();
    let data: unknown;
    try {
      data = (await publicHttp.post('/auth/refresh', { refreshToken: current.refreshToken })).data;
    } catch (e) {
      const err = toDomainError(e);
      if (err instanceof ApiRequestError && err.status >= 400 && err.status < 500) {
        // Refresh token revoked/expired/rotated away: the user must sign in again.
        await session.clear();
        onAuthLost?.();
        throw new AuthRequiredError();
      }
      throw err;
    }
    const parsed = TokenPairSchema.safeParse(data);
    if (!parsed.success) throw new ContractError('Invalid /auth/refresh response');
    await session.setTokens(parsed.data);
    return parsed.data;
  }

  /** Single-flight: concurrent 401s share one refresh call (refresh tokens rotate, so a second call would fail). */
  function refreshTokens(): Promise<TokenPair> {
    if (!refreshing) {
      refreshing = doRefresh().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  http.interceptors.request.use(async (config) => {
    const c = config as AuthConfig;
    const tokens = await session.getTokens();
    if (tokens) {
      c.headers.set('Authorization', `Bearer ${tokens.accessToken}`);
      c._sentAccessToken = tokens.accessToken;
    }
    return c;
  });

  http.interceptors.response.use(undefined, async (error: unknown) => {
    if (!axios.isAxiosError(error)) throw error;
    const cfg = error.config as AuthConfig | undefined;
    if (error.response?.status !== 401 || !cfg || cfg._retried) throw error;
    cfg._retried = true;
    const current = await session.getTokens();
    if (current && cfg._sentAccessToken && current.accessToken !== cfg._sentAccessToken) {
      // Another request already refreshed while this one was in flight: just retry with the new token.
      return http.request(cfg);
    }
    await refreshTokens();
    return http.request(cfg);
  });

  return { http, publicHttp, refreshTokens };
}
