import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { t } from '../i18n';
import { AuthShell, IconInput, PasswordInput } from '../components/AuthShell';
import { Icon } from '../components/icons';
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
    <AuthShell>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <h1>{t('login.title')}</h1>
        <p className="auth-subtitle">{t('login.subtitle')}</p>
        {notice && !error ? <div className="alert alert-info">{t(`login.${notice}`)}</div> : null}
        {error ? (
          <div className="alert alert-error" role="alert">
            {loginErrorMessage(error)}
          </div>
        ) : null}
        <label className="field auth-field">
          <span>{t('email')}</span>
          <IconInput
            icon="mail"
            type="email"
            autoComplete="username"
            placeholder={t('emailPlaceholder')}
            aria-invalid={errors.email ? true : undefined}
            {...register('email')}
          />
          <FieldError message={errors.email?.message} />
        </label>
        <label className="field auth-field">
          <span>{t('password')}</span>
          <PasswordInput
            autoComplete="current-password"
            placeholder={t('passwordPlaceholder')}
            aria-invalid={errors.password ? true : undefined}
            {...register('password')}
          />
          <FieldError message={errors.password?.message} />
        </label>
        <div className="auth-forgot">
          <Link to="/forgot-password">{t('login.forgot')}</Link>
        </div>
        <button type="submit" className="auth-submit" disabled={isSubmitting}>
          <span>{isSubmitting ? t('login.submitting') : t('login.submit')}</span>
          {isSubmitting ? <span className="spinner" aria-hidden /> : <Icon name="arrow" size={18} />}
        </button>
      </form>
    </AuthShell>
  );
}
