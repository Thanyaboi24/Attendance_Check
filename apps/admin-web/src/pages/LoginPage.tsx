import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { LoginRequestSchema, type LoginRequest } from '@attendance/shared';
import type { z } from 'zod';
import { loginErrorMessage, useAuth } from '../auth/AuthContext';
import { FieldError } from '../components/ui';

export function LoginPage() {
  const { login, status, notice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest, unknown, z.output<typeof LoginRequestSchema>>({
    resolver: zodResolver(LoginRequestSchema),
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
      setError(loginErrorMessage(e));
    }
  });

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={onSubmit} noValidate>
        <h1>Attendance Admin</h1>
        <p className="muted">Sign in with your institutional account.</p>
        {notice && !error ? <div className="alert alert-info">{notice}</div> : null}
        {error ? (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        ) : null}
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" {...register('email')} />
          <FieldError message={errors.email?.message} />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" {...register('password')} />
          <FieldError message={errors.password?.message} />
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="center small">
          <Link to="/forgot-password">Forgot your password?</Link>
        </p>
      </form>
    </div>
  );
}
