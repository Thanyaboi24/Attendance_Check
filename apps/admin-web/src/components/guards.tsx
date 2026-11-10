import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import type { Role } from '@attendance/shared';
import { useAuth } from '../auth/AuthContext';
import { navFor } from '../auth/roles';
import { Loading } from './ui';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading label="Restoring session…" />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function RequireRole({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Forbidden />;
  return <>{children}</>;
}

export function Forbidden() {
  return (
    <div className="card narrow">
      <h1>Not available for your role</h1>
      <p>Your account does not have access to this page. Use the navigation to open a page available to you.</p>
      <Link to="/">Go to the start page</Link>
    </div>
  );
}

/** First page the signed-in role may open. */
export function HomeRedirect() {
  const { user } = useAuth();
  const first = navFor(user?.role)[0];
  return <Navigate to={first?.path ?? '/login'} replace />;
}
