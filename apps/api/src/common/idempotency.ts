import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ErrorCode } from '@attendance/shared';
import { Errors } from './app-exception';

/** Reads the `Idempotency-Key` header (may be undefined). */
export const IdempotencyKey = createParamDecorator((_d: unknown, ctx: ExecutionContext): string | undefined => {
  const value = ctx.switchToHttp().getRequest().headers['idempotency-key'];
  return Array.isArray(value) ? value[0] : value;
});

/**
 * The idempotency key of an attendance write is the client-generated UUID of the record itself
 * (request id / correction id). A present header must match it; the record id then guarantees
 * "same key → same result" through the database primary key.
 */
export function assertIdempotencyKey(header: string | undefined, id: string): void {
  if (header !== undefined && header.toLowerCase() !== id.toLowerCase()) {
    throw Errors.badRequest(ErrorCode.IDEMPOTENCY_KEY_MISMATCH, 'Idempotency-Key must equal the request identifier');
  }
}
