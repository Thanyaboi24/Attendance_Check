import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearchParams } from 'react-router';
import { Trans, useTranslation } from 'react-i18next';
import { z } from 'zod';
import { ErrorCode } from '@attendance/shared';
import { api, ApiRequestError, errorMessage } from '../api/client';
import { FieldError } from '../components/ui';
import { t } from '../i18n';
import { AuthShell, IconInput, PasswordInput } from '../components/AuthShell';
import { emailField, msg } from '../lib/validation';

/** Same rule as the shared `ForgotPasswordRequestSchema`, with a translated message. */
const ForgotForm = z.object({ email: emailField() });
type ForgotFormInput = z.input<typeof ForgotForm>;

export function ForgotPasswordPage() {
  const { t } = useTranslation(['auth', 'common']);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotFormInput, unknown, z.output<typeof ForgotForm>>({
    resolver: zodResolver(ForgotForm),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api.post('/auth/password/forgot', v, { auth: false });
      setSent(true);
    } catch (e) {
      setError(e);
    }
  });

  return (
    <AuthShell>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <h1>{t('forgot.title')}</h1>
        {sent ? (
          <div className="alert alert-success" role="status">
            {t('forgot.sent')}
          </div>
        ) : (
          <>
            <p className="auth-subtitle">{t('forgot.intro')}</p>
            {error ? <div className="alert alert-error">{errorMessage(error)}</div> : null}
            <label className="field auth-field">
              <span>{t('email')}</span>
              <IconInput icon="mail" type="email" autoComplete="email" placeholder={t('emailPlaceholder')} {...register('email')} />
              <FieldError message={errors.email?.message} />
            </label>
            <button type="submit" className="auth-submit" disabled={isSubmitting}>
              {t('forgot.submit')}
            </button>
          </>
        )}
        <p className="center small">
          <Link to="/login">{t('forgot.backToSignIn')}</Link>
        </p>
      </form>
    </AuthShell>
  );
}

/** Same rules as the shared `PasswordSchema`, with messages in the current language. */
const PasswordField = z
  .string()
  .min(8, msg(() => t('auth:rules.errMinLength')))
  .max(128, msg(() => t('auth:rules.errMaxLength')))
  .regex(/[A-Za-z]/, msg(() => t('auth:rules.errLetter')))
  .regex(/\d/, msg(() => t('auth:rules.errDigit')));

const SetPasswordForm = z
  .object({ password: PasswordField, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { ...msg(() => t('auth:setPassword.mismatch')), path: ['confirm'] });
type SetPasswordForm = z.infer<typeof SetPasswordForm>;

const HINTS = [
  { key: 'minLength', test: (p: string) => p.length >= 8 },
  { key: 'letter', test: (p: string) => /[A-Za-z]/.test(p) },
  { key: 'digit', test: (p: string) => /\d/.test(p) },
] as const;

/** Shared by /activate?token= (24 h link) and /reset-password?token= (30 min link). */
export function SetPasswordPage({ mode }: { mode: 'activate' | 'reset' }) {
  const { t } = useTranslation(['auth', 'common']);
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SetPasswordForm>({ resolver: zodResolver(SetPasswordForm), defaultValues: { password: '', confirm: '' } });
  const password = watch('password') ?? '';

  const title = mode === 'activate' ? t('setPassword.activateTitle') : t('setPassword.resetTitle');
  const invalidLink = mode === 'activate' ? t('setPassword.invalidActivationLink') : t('setPassword.invalidResetLink');

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api.post(mode === 'activate' ? '/auth/activate' : '/auth/password/reset', { token, password: v.password }, { auth: false });
      setDone(true);
    } catch (e) {
      setError(e);
    }
  });
  const errorText = error
    ? error instanceof ApiRequestError && error.code === ErrorCode.TOKEN_INVALID
      ? invalidLink
      : errorMessage(error)
    : null;

  return (
    <AuthShell>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <h1>{title}</h1>
        {!token || token.length < 16 ? (
          <div className="alert alert-error" role="alert">
            {invalidLink}
          </div>
        ) : done ? (
          <div className="alert alert-success" role="status">
            {mode === 'activate' ? t('setPassword.activated') : t('setPassword.changed')}{' '}
            <Trans t={t} i18nKey="setPassword.done" components={{ link: <Link to="/login" /> }} />
          </div>
        ) : (
          <>
            {errorText ? (
              <div className="alert alert-error" role="alert">
                {errorText}
              </div>
            ) : null}
            <label className="field auth-field">
              <span>{t('setPassword.newPassword')}</span>
              <PasswordInput autoComplete="new-password" {...register('password')} />
              <FieldError message={errors.password?.message} />
            </label>
            <ul className="hints" aria-label={t('setPassword.requirements')}>
              {HINTS.map((h) => (
                <li key={h.key} className={h.test(password) ? 'ok' : undefined}>
                  {h.test(password) ? '✓' : '•'} {t(`rules.${h.key}`)}
                </li>
              ))}
            </ul>
            <label className="field auth-field">
              <span>{t('setPassword.confirmPassword')}</span>
              <PasswordInput autoComplete="new-password" {...register('confirm')} />
              <FieldError message={errors.confirm?.message} />
            </label>
            <button type="submit" className="auth-submit" disabled={isSubmitting}>
              {mode === 'activate' ? t('setPassword.activateSubmit') : t('setPassword.resetSubmit')}
            </button>
          </>
        )}
        <p className="center small">
          <Link to={mode === 'reset' && !done ? '/forgot-password' : '/login'}>
            {mode === 'reset' && !done ? t('setPassword.requestNewLink') : t('setPassword.goToSignIn')}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
