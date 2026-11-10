import { z } from 'zod';
import { CorrectionStatus } from '../enums';
import { IsoDate, IsoDateTime, Uuid } from './common';

export const CorrectionStatusSchema = z.enum([
  CorrectionStatus.PENDING,
  CorrectionStatus.APPROVED,
  CorrectionStatus.REJECTED,
]);

/** POST /corrections: staff asks for a missing or incorrect record to be fixed (FR09). */
export const CreateCorrectionSchema = z
  .object({
    correctionId: Uuid,
    sessionId: z.string().nullable(),
    workDate: IsoDate,
    requestedCheckInAt: IsoDateTime.nullable(),
    requestedCheckOutAt: IsoDateTime.nullable(),
    reason: z.string().trim().min(5, 'Please describe the reason (at least 5 characters)').max(1000),
  })
  .refine((c) => c.requestedCheckInAt != null || c.requestedCheckOutAt != null, {
    message: 'Provide a check-in time, a check-out time, or both',
    path: ['requestedCheckInAt'],
  })
  .refine(
    (c) =>
      c.requestedCheckInAt == null ||
      c.requestedCheckOutAt == null ||
      Date.parse(c.requestedCheckOutAt) >= Date.parse(c.requestedCheckInAt),
    { message: 'Check-out cannot be before check-in', path: ['requestedCheckOutAt'] },
  );
export type CreateCorrection = z.infer<typeof CreateCorrectionSchema>;

export const PersonRefSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  staffId: z.string().optional(),
  department: z.string().optional(),
});

export const CorrectionDtoSchema = z.object({
  id: z.string(),
  user: PersonRefSchema,
  sessionId: z.string().nullable(),
  workDate: IsoDate,
  requestedCheckInAt: IsoDateTime.nullable(),
  requestedCheckOutAt: IsoDateTime.nullable(),
  reason: z.string(),
  status: CorrectionStatusSchema,
  reviewNote: z.string().nullable(),
  reviewer: PersonRefSchema.nullable(),
  reviewedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type CorrectionDto = z.infer<typeof CorrectionDtoSchema>;

/** POST /admin/corrections/{id}/review: approval may adjust the requested times. */
export const ReviewCorrectionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    note: z.string().trim().min(3, 'A reason is required').max(1000),
    checkInAt: IsoDateTime.nullable().optional(),
    checkOutAt: IsoDateTime.nullable().optional(),
  })
  .refine(
    (r) => r.checkInAt == null || r.checkOutAt == null || Date.parse(r.checkOutAt) >= Date.parse(r.checkInAt),
    { message: 'Check-out cannot be before check-in', path: ['checkOutAt'] },
  );
export type ReviewCorrection = z.infer<typeof ReviewCorrectionSchema>;
