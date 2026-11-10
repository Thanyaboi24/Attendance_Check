import { z } from 'zod';

/** Environment is validated once at start-up (design §17.8). */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SEC: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  ACTIVATION_TTL_HOURS: z.coerce.number().int().positive().default(24),
  PASSWORD_RESET_TTL_MIN: z.coerce.number().int().positive().default(30),
  LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MIN: z.coerce.number().int().positive().default(15),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  APP_LINK_BASE: z.string().default('http://localhost:5173'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  MAIL_FROM: z.string().default('Faculty Attendance <no-reply@siit.tu.ac.th>'),
  /** Location evidence retention; agree with the institution before deployment (design §13 open issues). */
  EVIDENCE_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
  ENABLE_SWAGGER: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  ENABLE_JOBS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Development/emulator testing only: accept evidence flagged as mock location (still stored as isMock). */
  ALLOW_MOCK_LOCATION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${lines}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.ALLOW_MOCK_LOCATION) {
    throw new Error('ALLOW_MOCK_LOCATION must not be enabled in production');
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}

/** For tests that change process.env between app instances. */
export function resetEnvCache() {
  cached = undefined;
}

export const ENV = Symbol('ENV');
