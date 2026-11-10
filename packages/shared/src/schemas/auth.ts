import { z } from 'zod';
import { AccountStatus, Role } from '../enums';

export const RoleSchema = z.enum([Role.STAFF, Role.ATTENDANCE_ADMIN, Role.SYSTEM_ADMIN]);
export const AccountStatusSchema = z.enum([
  AccountStatus.PENDING_ACTIVATION,
  AccountStatus.ACTIVE,
  AccountStatus.DEACTIVATED,
]);

const NormalisedEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address' }));

/** At least 8 characters with a letter and a digit. */
export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a digit');

export const LoginRequestSchema = z.object({
  email: NormalisedEmail,
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

export const ForgotPasswordRequestSchema = z.object({ email: NormalisedEmail });
export type ForgotPasswordRequest = z.input<typeof ForgotPasswordRequestSchema>;

/** Used for both account activation and password reset (single-use, time-limited token). */
export const SetPasswordWithTokenSchema = z.object({ token: z.string().min(16), password: PasswordSchema });
export type SetPasswordWithToken = z.infer<typeof SetPasswordWithTokenSchema>;

export const OkResponseSchema = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponseSchema>;
