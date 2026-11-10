import { z } from 'zod';

export const IsoDateTime = z.iso.datetime({ offset: true });
/** Calendar date `YYYY-MM-DD`, interpreted in the display time zone (Asia/Bangkok). */
export const IsoDate = z.iso.date();
export const Uuid = z.uuid();

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const PageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export function paginated<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Inclusive date range used by history, admin lists and reports. */
export const DateRangeQuerySchema = z
  .object({ from: IsoDate, to: IsoDate })
  .refine((q) => q.from <= q.to, { message: 'from must not be after to', path: ['to'] });
export type DateRangeQuery = z.infer<typeof DateRangeQuerySchema>;
