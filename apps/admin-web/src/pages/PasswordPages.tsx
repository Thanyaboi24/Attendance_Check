import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import { ErrorCode, ForgotPasswordRequestSchema, PasswordSchema, type ForgotPasswordRequest } from '@attendance/shared';
import { api, ApiRequestError, errorMessage } from '../api/client';
import { FieldError } from '../components/ui';

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordRequest, unknown, z.output<typeof ForgotPasswordRequestSchema>>({
    resolver: zodResolver(ForgotPasswordRequestSchema),
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
    <div className="auth-page">
      <form className="card auth-card" onSubmit={onSubmit} noValidate>
        <h1>Reset your password</h1>
        {sent ? (
          <div className="alert alert-success" role="status">
            If an account exists for that address, a reset link has been sent. The link is valid for 30 minutes.
          </div>
        ) : (
          <>
            <p className="muted">Enter your institutional email and we will send you a reset link.</p>
            {error ? <div className="alert alert-error">{errorMessage(error)}</div> : null}
            <label className="field">
              <span>Email</span>
              <input type="email" autoComplete="email" {...register('email')} />
              <FieldError message={errors.email?.message} />
            </label>
            <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
              Send reset link
            </button>
          </>
        )}
        <p className="center small">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}

const SetPasswordForm = z
  .object({ password: PasswordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });
type SetPasswordForm = z.infer<typeof SetPasswordForm>;

const HINTS: { label: string; test: (p: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'Contains a letter', test: (p) => /[A-Za-z]/.test(p) },
  { label: 'Contains a digit', test: (p) => /\d/.test(p) },
];

/** Shared by /activate?token= (24 h link) and /reset-password?token= (30 min link). */
export function SetPasswordPage({ mode }: { mode: 'activate' | 'reset' }) {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SetPasswordForm>({ resolver: zodResolver(SetPasswordForm), defaultValues: { password: '', confirm: '' } });
  const password = watch('password') ?? '';

  const title = mode === 'activate' ? 'Activate your account' : 'Choose a new password';
  const invalidLink =
    mode === 'activate'
      ? 'This activation link is invalid or has expired. Ask a system administrator to resend the activation email.'
      : 'This reset link is invalid or has expired. Request a new one.';

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api.post(mode === 'activate' ? '/auth/activate' : '/auth/password/reset', { token, password: v.password }, { auth: false });
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiRequestError && e.code === ErrorCode.TOKEN_INVALID ? invalidLink : errorMessage(e));
    }
  });

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={onSubmit} noValidate>
        <h1>{title}</h1>
        {!token || token.length < 16 ? (
          <div className="alert alert-error" role="alert">
            {invalidLink}
          </div>
        ) : done ? (
          <div className="alert alert-success" role="status">
            {mode === 'activate' ? 'Your account is active.' : 'Your password has been changed.'} Staff members can now
            sign in on the mobile app; administrators can <Link to="/login">sign in here</Link>.
          </div>
        ) : (
          <>
            {error ? (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            ) : null}
            <label className="field">
              <span>New password</span>
              <input type="password" autoComplete="new-password" {...register('password')} />
              <FieldError message={errors.password?.message} />
            </label>
            <ul className="hints" aria-label="Password requirements">
              {HINTS.map((h) => (
                <li key={h.label} className={h.test(password) ? 'ok' : undefined}>
                  {h.test(password) ? '✓' : '•'} {h.label}
                </li>
              ))}
            </ul>
            <label className="field">
              <span>Confirm password</span>
              <input type="password" autoComplete="new-password" {...register('confirm')} />
              <FieldError message={errors.confirm?.message} />
            </label>
            <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
              {mode === 'activate' ? 'Activate account' : 'Set password'}
            </button>
          </>
        )}
        <p className="center small">
          <Link to={mode === 'reset' && !done ? '/forgot-password' : '/login'}>
            {mode === 'reset' && !done ? 'Request a new link' : 'Go to sign in'}
          </Link>
        </p>
      </form>
    </div>
  );
}
