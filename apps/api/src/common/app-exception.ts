import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@attendance/shared';

/** Error with a machine-readable code; serialised as `ApiError` `{ code, message, details? }`. */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: ErrorCode | string,
    message: string,
    public readonly details?: unknown,
  ) {
    super({ code, message, ...(details === undefined ? {} : { details }) }, status);
  }
}

export const Errors = {
  notFound: (what = 'Resource') => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, `${what} not found`),
  forbidden: (message = 'You do not have permission to perform this action') =>
    new AppException(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, message),
  conflict: (code: ErrorCode, message: string, details?: unknown) =>
    new AppException(HttpStatus.CONFLICT, code, message, details),
  unprocessable: (code: ErrorCode, message: string, details?: unknown) =>
    new AppException(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details),
  badRequest: (code: ErrorCode, message: string, details?: unknown) =>
    new AppException(HttpStatus.BAD_REQUEST, code, message, details),
};
