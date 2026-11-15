import { SignUpRequestSchema } from '@attendance/shared';
import type { z } from 'zod';
import { t } from '../../i18n';
import { isApiError, isNetworkError, validationMessage } from '../errors';
import type { AppDeps } from '../ports';

/** Fields of the sign-up form (the request fields + the confirmation, which never leaves the phone). */
export const SIGN_UP_FIELDS = ['staffId', 'fullName', 'department', 'email', 'password', 'confirmPassword'] as const;
export type SignUpField = (typeof SIGN_UP_FIELDS)[number];
export type SignUpForm = Record<SignUpField, string>;
/** Translated message per field (first problem only). */
export type SignUpFieldErrors = Partial<Record<SignUpField, string>>;
export type ValidSignUp = z.output<typeof SignUpRequestSchema>;

export type SignUpValidation = { ok: true; request: ValidSignUp } | { ok: false; errors: SignUpFieldErrors };

export type SignUpOutcome =
  /** Account created as PENDING_APPROVAL; an administrator has to approve it before it can sign in. */
  | { kind: 'SUBMITTED'; email: string }
  /** Field problems (client-side or reported by the server, e.g. an email outside the institution's domains). */
  | { kind: 'INVALID'; errors: SignUpFieldErrors }
  /** Email or staff ID already registered (409 DUPLICATE_USER). */
  | { kind: 'DUPLICATE' }
  /** Self-registration switched off on the server (403 SIGNUP_DISABLED). */
  | { kind: 'DISABLED' }
  | { kind: 'RATE_LIMITED' }
  | { kind: 'NETWORK' }
  | { kind: 'ERROR'; message: string };

const isField = (k: unknown): k is SignUpField => typeof k === 'string' && (SIGN_UP_FIELDS as readonly string[]).includes(k);

/** Client-side validation with the shared schema + password confirmation. Messages are in the current language. */
export function validateSignUp(form: SignUpForm): SignUpValidation {
  const errors: SignUpFieldErrors = {};
  const { confirmPassword, ...body } = form;
  const parsed = SignUpRequestSchema.safeParse(body);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (isField(field) && errors[field] == null) {
        errors[field] = validationMessage(issue.message, t('errors:validation.invalidInput'));
      }
    }
  }
  if (confirmPassword === '') errors.confirmPassword = t('auth:signUp.confirmRequired');
  else if (confirmPassword !== form.password) errors.confirmPassword = t('auth:signUp.mismatch');

  if (!parsed.success || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, request: parsed.data };
}

/**
 * Server field message → current language. The email-domain restriction ("Use your institutional email (@a, @b)")
 * keeps the server's domain list; other messages go through the shared-schema translations.
 */
function serverFieldMessage(field: SignUpField, message: string): string {
  if (field === 'email') {
    const domains = /\((@[^)]+)\)/.exec(message)?.[1];
    if (domains && /institutional email/i.test(message)) return t('auth:signUp.emailDomain', { domains });
  }
  return validationMessage(message, message);
}

/** `details` of a 400 VALIDATION_FAILED: `{ fields: { email: [msg] } }` or the zod issue list of the validation pipe. */
function serverFieldErrors(details: unknown): SignUpFieldErrors {
  const errors: SignUpFieldErrors = {};
  if (details && typeof details === 'object' && 'fields' in details) {
    const fields = (details as { fields: unknown }).fields;
    if (fields && typeof fields === 'object') {
      for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
        const first = Array.isArray(value) ? value[0] : value;
        if (isField(key) && typeof first === 'string') errors[key] = serverFieldMessage(key, first);
      }
    }
  } else if (Array.isArray(details)) {
    for (const issue of details as Array<{ path?: unknown; message?: unknown }>) {
      const key = Array.isArray(issue?.path) ? issue.path[0] : undefined;
      if (isField(key) && errors[key] == null && typeof issue.message === 'string') errors[key] = serverFieldMessage(key, issue.message);
    }
  }
  return errors;
}

/** Staff self-registration (POST /auth/signup). Never stores tokens: the account cannot sign in until approved. */
export async function signUp(deps: AppDeps, form: SignUpForm): Promise<SignUpOutcome> {
  const checked = validateSignUp(form);
  if (!checked.ok) return { kind: 'INVALID', errors: checked.errors };

  try {
    const res = await deps.authApi.signUp(checked.request);
    return { kind: 'SUBMITTED', email: res.email };
  } catch (e) {
    if (isNetworkError(e)) return { kind: 'NETWORK' };
    if (isApiError(e)) {
      if (e.code === 'DUPLICATE_USER' || e.status === 409) return { kind: 'DUPLICATE' };
      if (e.code === 'SIGNUP_DISABLED') return { kind: 'DISABLED' };
      if (e.status === 429) return { kind: 'RATE_LIMITED' };
      if (e.code === 'VALIDATION_FAILED' || e.status === 400) {
        const errors = serverFieldErrors(e.details);
        if (Object.keys(errors).length > 0) return { kind: 'INVALID', errors };
        return { kind: 'ERROR', message: t('errors:validation.invalidInput') };
      }
    }
    return { kind: 'ERROR', message: t('errors:generic') };
  }
}
