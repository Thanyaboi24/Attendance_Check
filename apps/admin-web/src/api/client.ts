import type { ApiError as ApiErrorBody, TokenPair } from '@attendance/shared';
import { ErrorCode } from '@attendance/shared';

export const REFRESH_TOKEN_KEY = 'attendance-admin.refreshToken';

/** A non-2xx response (or a network failure, status 0) normalised to the backend `ApiError` shape. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isForbidden(): boolean {
    return this.status === 403 && this.code !== ErrorCode.ACCOUNT_INACTIVE;
  }
}

export const NETWORK_ERROR = 'NETWORK_ERROR';

export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Query;
  body?: unknown;
  /** Attach the bearer token and refresh on 401 (default true). Public auth endpoints pass false. */
  auth?: boolean;
  signal?: AbortSignal;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  baseUrl: string;
  /** Defaults to the global fetch, looked up on every call (so tests can stub it). */
  fetch?: FetchLike;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * Fetch wrapper for the admin API.
 * - Access token kept in memory only; refresh token in sessionStorage (cleared when the tab closes).
 * - On 401 it refreshes once (single-flight: concurrent 401s share one `/auth/refresh` call) and retries.
 * - If the refresh fails the session is cleared and `onAuthLost` listeners are notified.
 */
export class ApiClient {
  readonly baseUrl: string;
  private accessToken: string | null = null;
  private refreshing: Promise<boolean> | null = null;
  private readonly fetchImpl: FetchLike;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  private authLostListeners = new Set<() => void>();

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.storage = opts.storage ?? sessionStorage;
  }

  // ---- token state -----------------------------------------------------------
  setTokens(tokens: Pick<TokenPair, 'accessToken' | 'refreshToken'>): void {
    this.accessToken = tokens.accessToken;
    this.storage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }

  clearTokens(): void {
    this.accessToken = null;
    this.storage.removeItem(REFRESH_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return this.storage.getItem(REFRESH_TOKEN_KEY);
  }

  hasAccessToken(): boolean {
    return this.accessToken !== null;
  }

  onAuthLost(listener: () => void): () => void {
    this.authLostListeners.add(listener);
    return () => this.authLostListeners.delete(listener);
  }

  /** Single-flight refresh. Resolves true when a new token pair was stored. */
  refresh(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;
    try {
      const tokens = await this.request<TokenPair>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
        auth: false,
      });
      this.setTokens(tokens);
      return true;
    } catch (e) {
      // Only a definitive rejection drops the stored token; a network blip keeps it for a later retry.
      if (e instanceof ApiRequestError && e.status !== 0) this.storage.removeItem(REFRESH_TOKEN_KEY);
      this.accessToken = null;
      return false;
    }
  }

  // ---- requests --------------------------------------------------------------
  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const res = await this.send(path, opts);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  get<T>(path: string, query?: Query): Promise<T> {
    return this.request<T>(path, { query });
  }
  post<T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'body' | 'method'> = {}): Promise<T> {
    return this.request<T>(path, { ...opts, method: 'POST', body });
  }
  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body });
  }
  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body });
  }

  /** Authenticated download (CSV reports): returns the blob and the server-suggested file name. */
  async download(path: string, query?: Query): Promise<{ blob: Blob; filename: string | null }> {
    const res = await this.send(path, { query });
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') ?? '';
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    return { blob, filename: m?.[1] ? decodeURIComponent(m[1]) : null };
  }

  private async send(path: string, opts: RequestOptions, isRetry = false): Promise<Response> {
    const auth = opts.auth ?? true;
    if (auth && !this.accessToken && !isRetry && this.getRefreshToken()) {
      // e.g. after a page reload: the access token lives only in memory.
      await this.refresh();
    }
    const headers: Record<string, string> = { Accept: 'application/json, text/csv' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const token = this.accessToken;
    if (auth && token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}${buildQuery(opts.query)}`, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      throw new ApiRequestError(0, NETWORK_ERROR, 'Cannot reach the server. Check your connection and try again.');
    }

    if (res.status === 401 && auth) {
      if (!isRetry) {
        // Another request may already have rotated the token while this one was in flight.
        const refreshed = this.accessToken !== token && this.accessToken !== null ? true : await this.refresh();
        if (refreshed) return this.send(path, opts, true);
      }
      this.clearTokens();
      this.authLostListeners.forEach((l) => l());
    }
    if (!res.ok) throw await toApiError(res);
    return res;
  }
}

async function toApiError(res: Response): Promise<ApiRequestError> {
  let body: Partial<ApiErrorBody> | null = null;
  try {
    body = (await res.json()) as Partial<ApiErrorBody>;
  } catch {
    body = null;
  }
  return new ApiRequestError(
    res.status,
    typeof body?.code === 'string' ? body.code : `HTTP_${res.status}`,
    typeof body?.message === 'string' ? body.message : res.statusText || `Request failed (${res.status})`,
    body?.details,
  );
}

/** Human-readable message for any thrown value. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiRequestError) {
    if (e.isForbidden) return 'You do not have permission to perform this action.';
    if (e.code === ErrorCode.VALIDATION_FAILED) return `Invalid input: ${e.message}`;
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}

export const api = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL || '/api/v1' });
