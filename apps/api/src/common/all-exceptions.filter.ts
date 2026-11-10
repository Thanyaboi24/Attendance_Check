import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '@attendance/shared';
import type { Response } from 'express';

/** Every error leaves the API as `ApiError` `{ code, message, details? }`. Never leaks stack traces. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toBody(exception);
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(status).json(body);
  }

  private toBody(exception: unknown): { status: number; body: { code: string; message: string; details?: unknown } } {
    if (exception instanceof ThrottlerException) {
      return { status: 429, body: { code: ErrorCode.RATE_LIMITED, message: 'Too many requests, please try again later' } };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const r = exception.getResponse();
      if (typeof r === 'object' && r !== null && 'code' in r) {
        return { status, body: r as { code: string; message: string } };
      }
      const message = typeof r === 'string' ? r : ((r as { message?: string }).message ?? exception.message);
      return { status, body: { code: defaultCode(status), message: Array.isArray(message) ? message.join('; ') : message } };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique / partial-unique index or CHECK constraint hit: the database enforced an integrity rule.
      if (exception.code === 'P2002') {
        return { status: 409, body: { code: ErrorCode.CONFLICT, message: 'The change conflicts with an existing record' } };
      }
      if (exception.code === 'P2025') {
        return { status: 404, body: { code: ErrorCode.NOT_FOUND, message: 'Record not found' } };
      }
    }
    if (isCheckViolation(exception)) {
      return { status: 400, body: { code: ErrorCode.INVALID_TIME_RANGE, message: 'The values violate a data integrity rule' } };
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: { code: ErrorCode.INTERNAL, message: 'Internal server error' } };
  }
}

function defaultCode(status: number): string {
  switch (status) {
    case 400:
      return ErrorCode.VALIDATION_FAILED;
    case 401:
      return ErrorCode.TOKEN_INVALID;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    default:
      return 'ERROR';
  }
}

function isCheckViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : '';
  return /violates check constraint|23514/.test(msg);
}
