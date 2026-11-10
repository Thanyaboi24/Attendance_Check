import { z } from 'zod';
import {
  AttendanceState,
  LocationClass,
  Method,
  NotificationEventType,
  NotificationStatus,
  RequestStatus,
  RequestType,
  SessionStatus,
} from '../enums';
import { IsoDate, IsoDateTime, Uuid } from './common';

export const RequestTypeSchema = z.enum([RequestType.CHECK_IN, RequestType.CHECK_OUT]);
export const RequestStatusSchema = z.enum([
  RequestStatus.ACTIVE,
  RequestStatus.APPROVED,
  RequestStatus.CANCELLED,
  RequestStatus.UNRESOLVED,
  RequestStatus.REJECTED,
]);
export const MethodSchema = z.enum([Method.MANUAL, Method.AUTOMATIC, Method.ADMIN_CORRECTED]);
export const LocationClassSchema = z.enum([
  LocationClass.CONFIRMED_INSIDE,
  LocationClass.CONFIRMED_OUTSIDE,
  LocationClass.UNCERTAIN,
]);
export const NotificationStatusSchema = z.enum([NotificationStatus.POSTED, NotificationStatus.FAILED]);
export const SessionStatusSchema = z.enum([SessionStatus.OPEN, SessionStatus.COMPLETED]);
export const AttendanceStateSchema = z.enum([
  AttendanceState.CHECKED_OUT,
  AttendanceState.PENDING_CHECK_IN,
  AttendanceState.CHECKED_IN,
  AttendanceState.PENDING_CHECK_OUT,
]);

/** Location evidence sent with a request. The server recomputes distance and classification (ADR-2). */
export const EvidenceInputSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  measuredAt: IsoDateTime,
  accuracyM: z.number().nonnegative().nullable(),
  isMock: z.boolean().default(false),
  clientDistanceM: z.number().nonnegative().nullable().optional(),
  clientClassification: LocationClassSchema.nullable().optional(),
});
export type EvidenceInput = z.input<typeof EvidenceInputSchema>;

export const DeviceInfoSchema = z.object({
  model: z.string().max(120),
  os: z.string().max(60),
  appVersion: z.string().max(30),
});
export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;

/** POST /attendance/requests: created after the notification was presented (or failed to post). */
export const CreateAttendanceRequestSchema = z
  .object({
    requestId: Uuid,
    type: RequestTypeSchema,
    configVersion: z.number().int().positive(),
    geofenceDetectedAt: IsoDateTime,
    notificationStatus: NotificationStatusSchema,
    notificationPostedAt: IsoDateTime.nullable(),
    device: DeviceInfoSchema.optional(),
  })
  .refine((b) => b.notificationStatus !== NotificationStatus.POSTED || b.notificationPostedAt != null, {
    message: 'notificationPostedAt is required when notificationStatus is POSTED',
    path: ['notificationPostedAt'],
  });
export type CreateAttendanceRequest = z.input<typeof CreateAttendanceRequestSchema>;

/** POST /attendance/requests/{id}/confirm: manual Check In / Check Out. */
export const ConfirmAttendanceSchema = z.object({
  userConfirmedAt: IsoDateTime,
  clientRecordedAt: IsoDateTime,
  evidence: EvidenceInputSchema,
  device: DeviceInfoSchema.optional(),
});
export type ConfirmAttendance = z.input<typeof ConfirmAttendanceSchema>;

/** POST /attendance/requests/{id}/auto: grace period expired; fresh evidence attached. */
export const AutoAttendanceSchema = z.object({
  notificationPostedAt: IsoDateTime,
  clientRecordedAt: IsoDateTime,
  evidence: EvidenceInputSchema,
  locationAttempts: z.number().int().min(1).max(10).default(1),
  device: DeviceInfoSchema.optional(),
});
export type AutoAttendance = z.input<typeof AutoAttendanceSchema>;

/** POST /attendance/requests/{id}/cancel: the opposite transition was confirmed by a fresh fix. */
export const CancelAttendanceSchema = z.object({
  reason: z.literal('CONFIRMED_OPPOSITE_SIDE'),
  clientRecordedAt: IsoDateTime,
  evidence: EvidenceInputSchema,
});
export type CancelAttendance = z.input<typeof CancelAttendanceSchema>;

export const UnresolvedReasonSchema = z.enum([
  'UNCERTAIN_LOCATION',
  'NOTIFICATION_FAILED',
  'INVALID_STATE',
  'LOCATION_UNAVAILABLE',
]);
export type UnresolvedReasonInput = z.infer<typeof UnresolvedReasonSchema>;

/** POST /attendance/requests/{id}/unresolved: the location could not be verified. */
export const UnresolvedAttendanceSchema = z.object({
  reason: UnresolvedReasonSchema,
  clientRecordedAt: IsoDateTime,
  evidence: EvidenceInputSchema.nullable().optional(),
});
export type UnresolvedAttendance = z.input<typeof UnresolvedAttendanceSchema>;

export const AttendanceRequestDtoSchema = z.object({
  id: z.string(),
  type: RequestTypeSchema,
  status: RequestStatusSchema,
  method: MethodSchema.nullable(),
  sessionId: z.string().nullable(),
  configVersion: z.number().int(),
  geofenceDetectedAt: IsoDateTime,
  notificationStatus: NotificationStatusSchema.nullable(),
  notificationPostedAt: IsoDateTime.nullable(),
  deadlineAt: IsoDateTime,
  approvedAt: IsoDateTime.nullable(),
  resolutionReason: z.string().nullable(),
  createdAt: IsoDateTime,
});
export type AttendanceRequestDto = z.infer<typeof AttendanceRequestDtoSchema>;

/** Result of confirm / auto / cancel / unresolved. Re-sending the same request returns the same result. */
export const AttendanceActionResultSchema = z.object({
  requestId: z.string(),
  status: RequestStatusSchema,
  sessionId: z.string().nullable(),
  method: MethodSchema.nullable(),
  /** Official attendance time = backend approval time (DS2 §2.7.6). */
  officialTime: IsoDateTime.nullable(),
  classification: LocationClassSchema.nullable(),
  distanceM: z.number().nullable(),
  reason: z.string().nullable(),
});
export type AttendanceActionResult = z.infer<typeof AttendanceActionResultSchema>;

export const SessionDtoSchema = z.object({
  id: z.string(),
  checkInAt: IsoDateTime,
  checkInMethod: MethodSchema,
  checkOutAt: IsoDateTime.nullable(),
  checkOutMethod: MethodSchema.nullable(),
  status: SessionStatusSchema,
  corrected: z.boolean(),
});
export type SessionDto = z.infer<typeof SessionDtoSchema>;

export const AttendanceStateResponseSchema = z.object({
  state: AttendanceStateSchema,
  openSession: SessionDtoSchema.nullable(),
  activeRequest: AttendanceRequestDtoSchema.nullable(),
  todaySessions: z.array(SessionDtoSchema),
  activeConfigVersion: z.number().int().nullable(),
  serverTime: IsoDateTime,
});
export type AttendanceStateResponse = z.infer<typeof AttendanceStateResponseSchema>;

export const HistoryQuerySchema = z
  .object({ from: IsoDate, to: IsoDate })
  .refine((q) => q.from <= q.to, { message: 'from must not be after to', path: ['to'] });
export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;

export const HistoryResponseSchema = z.object({
  sessions: z.array(SessionDtoSchema),
  /** UNRESOLVED requests in the range: the "issues" shown on the history screen. */
  issues: z.array(AttendanceRequestDtoSchema),
});
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;

/** POST /notification-events: evaluation data (design §13, slide "Notification Events"). */
export const NotificationEventSchema = z.object({
  requestId: Uuid,
  type: z.enum([
    NotificationEventType.POSTED,
    NotificationEventType.FAILED,
    NotificationEventType.RESPONDED,
    NotificationEventType.DISMISSED,
  ]),
  occurredAt: IsoDateTime,
  action: z.string().max(40).nullable().optional(),
  detail: z.string().max(500).nullable().optional(),
});
export type NotificationEventInput = z.input<typeof NotificationEventSchema>;
