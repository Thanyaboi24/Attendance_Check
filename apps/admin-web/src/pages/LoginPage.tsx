import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { t } from '../i18n';
import { LanguageSwitch } from '../i18n/LanguageSwitch';
import { loginErrorMessage, useAuth } from '../auth/AuthContext';
import { FieldError } from '../components/ui';
import { emailField, msg } from '../lib/validation';

/** Same rules as the shared `LoginRequestSchema`, with messages in the current language. */
const LoginForm = z.object({
  email: emailField(),
  password: z
    .string()
    .min(1, msg(() => t('auth:login.enterPassword')))
    .max(128),
});
type LoginFormInput = z.input<typeof LoginForm>;

export function LoginPage() {
  const { t } = useTranslation(['auth', 'common']);
  const { login, status, notice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // The error itself is kept (not its text) so the message follows the language switch.
  const [error, setError] = useState<unknown>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormInput, unknown, z.output<typeof LoginForm>>({
    resolver: zodResolver(LoginForm),
    defaultValues: { email: '', password: '' },
  });

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await login(values.email, values.password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (e) {
      setError(e);
    }
  });

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={onSubmit} noValidate>
        <div className="auth-lang">
          <LanguageSwitch />
        </div>
        <h1>{t('login.title')}</h1>
        <p className="muted">{t('login.subtitle')}</p>
        {notice && !error ? <div className="alert alert-info">{t(`login.${notice}`)}</div> : null}
        {error ? (
          <div className="alert alert-error" role="alert">
            {loginErrorMessage(error)}
          </div>
        ) : null}
        <label className="field">
          <span>{t('email')}</span>
          <input type="email" autoComplete="username" {...register('email')} />
          <FieldError message={errors.email?.message} />
        </label>
        <label className="field">
          <span>{t('password')}</span>
          <input type="password" autoComplete="current-password" {...register('password')} />
          <FieldError message={errors.password?.message} />
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
          {isSubmitting ? t('login.submitting') : t('login.submit')}
        </button>
        <p className="center small">
          <Link to="/forgot-password">{t('login.forgot')}</Link>
        </p>
      </form>
    </div>
  );
}
