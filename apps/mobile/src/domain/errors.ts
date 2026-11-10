/**
 * Error types shared by the data layer and the use cases. Use cases branch on these to decide between
 * "definitive answer from the backend" and "retry later via the outbox" (design §7.8, ADR-4).
 *
 * Every error carries a string `kind` so checks do not depend on `instanceof` across bundles/realms.
 */

export class ApiRequestError extends Error {
  readonly kind = 'api' as const;
  readonly status: number;
  /** `ErrorCode` from packages/shared (or `HTTP_<status>` when the body was not an ApiError). */
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** No response (offline, DNS, timeout, connection reset). Always retryable. */
export class NetworkError extends Error {
  readonly kind = 'network' as const;
  constructor(message = 'Network unavailable') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** The refresh token was rejected; the user has to sign in again. Outbox entries are kept. */
export class AuthRequiredError extends Error {
  readonly kind = 'auth' as const;
  constructor(message = 'Please sign in again') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

/** The response did not match the zod contract in packages/shared. */
export class ContractError extends Error {
  readonly kind = 'contract' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ContractError';
  }
}

export type LocationFailureReason = 'PERMISSION_DENIED' | 'SERVICES_DISABLED' | 'TIMEOUT' | 'ERROR';

export class LocationUnavailableError extends Error {
  readonly kind = 'location' as const;
  readonly reason: LocationFailureReason;
  constructor(reason: LocationFailureReason, message: string) {
    super(message);
    this.name = 'LocationUnavailableError';
    this.reason = reason;
  }
}

function kindOf(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'kind' in e ? String((e as { kind: unknown }).kind) : undefined;
}

export const isApiError = (e: unknown): e is ApiRequestError => kindOf(e) === 'api';
export const isNetworkError = (e: unknown): e is NetworkError => kindOf(e) === 'network';
export const isAuthError = (e: unknown): e is AuthRequiredError => kindOf(e) === 'auth';
export const isLocationError = (e: unknown): e is LocationUnavailableError => kindOf(e) === 'location';

/**
 * Retryable = the backend has not given a definitive answer. These go to (or stay in) the outbox:
 * network failures, 5xx, 408/429 and an expired login (synced after the user signs in again).
 */
export function isRetryable(e: unknown): boolean {
  if (isNetworkError(e) || isAuthError(e)) return true;
  if (isApiError(e)) return e.status >= 500 || e.status === 408 || e.status === 429;
  return false;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
