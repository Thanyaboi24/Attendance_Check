import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Role } from '@attendance/shared';
import { useAuth } from '../auth/AuthContext';
import { navFor } from '../auth/roles';
import { Loading } from './ui';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading label={t('restoringSession')} />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function RequireRole({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Forbidden />;
  return <>{children}</>;
}

export function Forbidden() {
  const { t } = useTranslation();
  return (
    <div className="card narrow">
      <h1>{t('forbidden.title')}</h1>
      <p>{t('forbidden.body')}</p>
      <Link to="/">{t('forbidden.link')}</Link>
    </div>
  );
}

/** First page the signed-in role may open. */
export function HomeRedirect() {
  const { user } = useAuth();
  const first = navFor(user?.role)[0];
  return <Navigate to={first?.path ?? '/login'} replace />;
}
