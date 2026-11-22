import { z } from 'zod';
import { HolidayType } from '../enums';
import { IsoDate, IsoDateTime } from './common';

/**
 * Holiday calendar (Thai public holidays plus days added by administrators). On a holiday nobody is expected to
 * come in: check-in is closed (the API refuses it and the app locks the button). Check-out stays open so a session
 * left open from the day before can still be closed.
 */
export const HolidayTypeSchema = z.enum([
  HolidayType.PUBLIC,
  HolidayType.SUBSTITUTE,
  HolidayType.GOVERNMENT,
  HolidayType.SPECIAL,
  HolidayType.UNIVERSITY,
]);

export const HolidayDtoSchema = z.object({
  id: z.string(),
  /** Bangkok calendar date, YYYY-MM-DD. */
  date: IsoDate,
  nameEn: z.string(),
  nameTh: z.string(),
  type: HolidayTypeSchema,
  note: z.string().nullable(),
});
export type HolidayDto = z.infer<typeof HolidayDtoSchema>;

/** Longest range one request may ask for (a little over a year, so "this year and the start of the next" works). */
export const HOLIDAY_QUERY_MAX_DAYS = 400;

export const HolidayQuerySchema = z
  .object({ from: IsoDate, to: IsoDate })
  .refine((q) => q.from <= q.to, { message: 'from must not be after to', path: ['to'] })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= HOLIDAY_QUERY_MAX_DAYS, {
    message: `The range can be at most ${HOLIDAY_QUERY_MAX_DAYS} days`,
    path: ['to'],
  });
export type HolidayQuery = z.infer<typeof HolidayQuerySchema>;

export const HolidayListResponseSchema = z.object({ holidays: z.array(HolidayDtoSchema) });
export type HolidayListResponse = z.infer<typeof HolidayListResponseSchema>;

export const CreateHolidaySchema = z.object({
  date: IsoDate,
  nameEn: z.string().trim().min(1, 'Enter the English name').max(160),
  nameTh: z.string().trim().min(1, 'Enter the Thai name').max(160),
  type: HolidayTypeSchema,
  note: z.string().trim().max(500).optional(),
});
export type CreateHoliday = z.input<typeof CreateHolidaySchema>;

export const UpdateHolidaySchema = CreateHolidaySchema.partial();
export type UpdateHoliday = z.input<typeof UpdateHolidaySchema>;

/** Admin list: one calendar year at a time. */
export const AdminHolidayQuerySchema = z.object({ year: z.coerce.number().int().min(2000).max(2100) });
export type AdminHolidayQuery = z.input<typeof AdminHolidayQuerySchema>;

export const AdminHolidayDtoSchema = HolidayDtoSchema.extend({ createdAt: IsoDateTime, updatedAt: IsoDateTime });
export type AdminHolidayDto = z.infer<typeof AdminHolidayDtoSchema>;
