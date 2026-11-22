import { z } from 'zod';
import { INSTITUTIONAL_EMAIL_MESSAGE, isInstitutionalEmail } from '../constants';
import { AccountStatus, Role } from '../enums';

export const RoleSchema = z.enum([Role.STAFF, Role.ATTENDANCE_ADMIN, Role.SYSTEM_ADMIN]);
export const AccountStatusSchema = z.enum([
  AccountStatus.PENDING_ACTIVATION,
  AccountStatus.PENDING_APPROVAL,
  AccountStatus.ACTIVE,
  AccountStatus.REJECTED,
  AccountStatus.DEACTIVATED,
]);

const NormalisedEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address' }));

/** A valid email on one of the institutional domains (@siit.tu.ac.th, @g.siit.tu.ac.th). */
export const InstitutionalEmailSchema = NormalisedEmail.refine(isInstitutionalEmail, { message: INSTITUTIONAL_EMAIL_MESSAGE });

/** At least 8 characters with a letter and a digit. */
export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a digit');

export const LoginRequestSchema = z.object({
  email: InstitutionalEmailSchema,
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginRequest = z.input<typeof LoginRequestSchema>;

export const UserProfileSchema = z.object({
  id: z.string(),
  staffId: z.string(),
  email: z.string(),
  fullName: z.string(),
  department: z.string(),
  role: RoleSchema,
  status: AccountStatusSchema,
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** ISO time the access token expires. */
  accessTokenExpiresAt: z.string(),
});
export type TokenPair = z.infer<typeof TokenPairSchema>;

export const LoginResponseSchema = z.object({ tokens: TokenPairSchema, user: UserProfileSchema });
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshRequestSchema = z.object({ refreshToken: z.string().min(1) });
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const LogoutRequestSchema = z.object({ refreshToken: z.string().min(1) });
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

export const ForgotPasswordRequestSchema = z.object({ email: InstitutionalEmailSchema });
export type ForgotPasswordRequest = z.input<typeof ForgotPasswordRequestSchema>;

/** Used for both account activation and password reset (single-use, time-limited token). */
export const SetPasswordWithTokenSchema = z.object({ token: z.string().min(16), password: PasswordSchema });
export type SetPasswordWithToken = z.infer<typeof SetPasswordWithTokenSchema>;

/**
 * Staff self-registration from the mobile app. The account is created as STAFF with status
 * PENDING_APPROVAL and cannot sign in until an administrator approves it.
 */
export const SignUpRequestSchema = z.object({
  staffId: z.string().trim().min(1, 'Enter your staff ID').max(40),
  email: InstitutionalEmailSchema,
  fullName: z.string().trim().min(1, 'Enter your full name').max(120),
  department: z.string().trim().min(1, 'Enter your department').max(120),
  password: PasswordSchema,
});
export type SignUpRequest = z.input<typeof SignUpRequestSchema>;

export const SignUpResponseSchema = z.object({ status: z.literal(AccountStatus.PENDING_APPROVAL), email: z.string() });
export type SignUpResponse = z.infer<typeof SignUpResponseSchema>;

export const OkResponseSchema = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponseSchema>;
