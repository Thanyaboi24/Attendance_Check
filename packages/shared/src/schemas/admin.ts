import { GeofenceZoneSchema } from './geofence';
import { z } from 'zod';
import { AccountStatus } from '../enums';
import { AccountStatusSchema, InstitutionalEmailSchema, RoleSchema, UserProfileSchema } from './auth';
import {
  AttendanceRequestDtoSchema,
  LocationClassSchema,
  RequestStatusSchema,
  SessionDtoSchema,
  SessionStatusSchema,
} from './attendance';
import { CorrectionStatusSchema } from './corrections';
import { IsoDate, IsoDateTime, PageQuerySchema } from './common';

// ---- Users (System Administrator) -----------------------------------------
export const AdminUserDtoSchema = UserProfileSchema.extend({
  createdAt: IsoDateTime,
  lastLoginAt: IsoDateTime.nullable(),
});
export type AdminUserDto = z.infer<typeof AdminUserDtoSchema>;

// ---- Sign-up review (Attendance Administrator, System Administrator) ---------
export const SignupStatusSchema = z.enum([AccountStatus.PENDING_APPROVAL, AccountStatus.REJECTED, AccountStatus.ACTIVE]);
export type SignupStatus = z.infer<typeof SignupStatusSchema>;

export const SignupDtoSchema = AdminUserDtoSchema.extend({
  reviewedAt: IsoDateTime.nullable(),
  reviewedBy: z.object({ id: z.string(), fullName: z.string() }).nullable(),
  reviewNote: z.string().nullable(),
});
export type SignupDto = z.infer<typeof SignupDtoSchema>;

export const SignupListQuerySchema = PageQuerySchema.extend({
  /** Default PENDING_APPROVAL. ACTIVE lists approved self-registrations. */
  status: SignupStatusSchema.optional(),
  q: z.string().trim().max(100).optional(),
});
export type SignupListQuery = z.input<typeof SignupListQuerySchema>;

export const ApproveSignupSchema = z.object({ note: z.string().trim().max(500).optional() });
export type ApproveSignup = z.input<typeof ApproveSignupSchema>;

export const RejectSignupSchema = z.object({ reason: z.string().trim().min(1, 'Enter a reason').max(500) });
export type RejectSignup = z.input<typeof RejectSignupSchema>;

export const CreateUserSchema = z.object({
  staffId: z.string().trim().min(1).max(40),
  email: InstitutionalEmailSchema,
  fullName: z.string().trim().min(1).max(120),
  department: z.string().trim().min(1).max(120),
  role: RoleSchema,
});
export type CreateUser = z.input<typeof CreateUserSchema>;

export const UpdateUserSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120),
    department: z.string().trim().min(1).max(120),
    role: RoleSchema,
    status: AccountStatusSchema,
  })
  .partial();
export type UpdateUser = z.infer<typeof UpdateUserSchema>;

export const UserListQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  role: RoleSchema.optional(),
  status: AccountStatusSchema.optional(),
});
export type UserListQuery = z.input<typeof UserListQuerySchema>;

// ---- Attendance review (Attendance Administrator) ---------------------------
export const UserRefSchema = z.object({
  id: z.string(),
  staffId: z.string(),
  fullName: z.string(),
  department: z.string(),
});
export type UserRef = z.infer<typeof UserRefSchema>;

export const AdminSessionDtoSchema = SessionDtoSchema.extend({ user: UserRefSchema });
export type AdminSessionDto = z.infer<typeof AdminSessionDtoSchema>;

export const AdminSessionQuerySchema = PageQuerySchema.extend({
  from: IsoDate,
  to: IsoDate,
  q: z.string().trim().max(100).optional(),
  department: z.string().trim().max(120).optional(),
  status: SessionStatusSchema.optional(),
});
export type AdminSessionQuery = z.input<typeof AdminSessionQuerySchema>;

export const AdminRequestQuerySchema = PageQuerySchema.extend({
  status: RequestStatusSchema.optional(),
  from: IsoDate.optional(),
  to: IsoDate.optional(),
  q: z.string().trim().max(100).optional(),
});
export type AdminRequestQuery = z.input<typeof AdminRequestQuerySchema>;

export const EvidenceDtoSchema = z.object({
  id: z.string(),
  /** Which action the reading was submitted with: CONFIRM, AUTO, CANCEL or UNRESOLVED. */
  stage: z.string(),
  lat: z.number(),
  lng: z.number(),
  measuredAt: IsoDateTime,
  accuracyM: z.number().nullable(),
  isMock: z.boolean(),
  distanceM: z.number().nullable(),
  classification: LocationClassSchema,
  clientClassification: LocationClassSchema.nullable(),
  receivedAt: IsoDateTime,
});
export type EvidenceDto = z.infer<typeof EvidenceDtoSchema>;

export const AdminRequestDtoSchema = AttendanceRequestDtoSchema.extend({ user: UserRefSchema });
export type AdminRequestDto = z.infer<typeof AdminRequestDtoSchema>;

export const AdminRequestDetailSchema = AdminRequestDtoSchema.extend({
  evidence: z.array(EvidenceDtoSchema),
  device: z.object({ model: z.string(), os: z.string(), appVersion: z.string() }).nullable(),
  userConfirmedAt: IsoDateTime.nullable(),
  clientRecordedAt: IsoDateTime.nullable(),
  config: z.object({
    version: z.number(),
    centerLat: z.number(),
    centerLng: z.number(),
    radiusM: z.number(),
    zones: z.array(GeofenceZoneSchema).min(1),
    maxLocationAgeSec: z.number(),
    maxAccuracyM: z.number(),
  }),
});
export type AdminRequestDetail = z.infer<typeof AdminRequestDetailSchema>;

/** PATCH /admin/attendance/sessions/{id}: direct correction; a reason is always required. */
export const AdminEditSessionSchema = z
  .object({
    checkInAt: IsoDateTime.optional(),
    checkOutAt: IsoDateTime.nullable().optional(),
    reason: z.string().trim().min(3, 'A reason is required').max(1000),
  })
  .refine((b) => b.checkInAt !== undefined || b.checkOutAt !== undefined, { message: 'Nothing to change' });
export type AdminEditSession = z.infer<typeof AdminEditSessionSchema>;

export const AdminCorrectionQuerySchema = PageQuerySchema.extend({ status: CorrectionStatusSchema.optional() });
export type AdminCorrectionQuery = z.input<typeof AdminCorrectionQuerySchema>;

// ---- Audit ------------------------------------------------------------------
export const AuditLogDtoSchema = z.object({
  id: z.string(),
  actor: z.object({ id: z.string(), fullName: z.string() }).nullable(),
  actorType: z.enum(['USER', 'SYSTEM']),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  previousValues: z.unknown().nullable(),
  newValues: z.unknown().nullable(),
  reason: z.string().nullable(),
  createdAt: IsoDateTime,
});
export type AuditLogDto = z.infer<typeof AuditLogDtoSchema>;

export const AuditLogQuerySchema = PageQuerySchema.extend({
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(60).optional(),
  action: z.string().max(60).optional(),
});
export type AuditLogQuery = z.input<typeof AuditLogQuerySchema>;

// ---- Dashboard & reports ----------------------------------------------------
export const DashboardSummarySchema = z.object({
  date: IsoDate,
  activeStaff: z.number().int(),
  checkedInNow: z.number().int(),
  checkedInToday: z.number().int(),
  automaticActionsToday: z.number().int(),
  manualActionsToday: z.number().int(),
  unresolvedRequests: z.number().int(),
  pendingCorrections: z.number().int(),
  /** Self-registrations waiting for approval. */
  pendingSignups: z.number().int(),
  longOpenSessions: z.number().int(),
});
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
