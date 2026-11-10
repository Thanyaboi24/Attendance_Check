import { HttpStatus, PipeTransform } from '@nestjs/common';
import { ErrorCode } from '@attendance/shared';
import type { z } from 'zod';
import { AppException } from './app-exception';

/** Validates a body/query with a schema from `packages/shared` (the same schema the clients use). */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, 'Request validation failed', result.error.issues);
    }
    return result.data;
  }
}

export const zodPipe = <T extends z.ZodType>(schema: T) => new ZodValidationPipe(schema);
