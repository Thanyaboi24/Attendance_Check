import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorCode, Role, type LoginResponse, type UserProfile } from '@attendance/shared';
import { api, ApiRequestError, NETWORK_ERROR, type ApiClient } from '../api/client';

export const STAFF_NOT_ALLOWED =
  'This dashboard is for administrators; please use the mobile app.';

export class LoginError extends Error {}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  user: UserProfile | null;
  /** Set when the session ended on its own (refresh failed), shown on the login page. */
  notice: string | null;
  login(email: string, password: string): Promise<UserProfile>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function loginErrorMessage(e: unknown): string {
  if (e instanceof LoginError) return e.message;
  if (e instanceof ApiRequestError) {
    if (e.status === 423 || e.code === ErrorCode.ACCOUNT_LOCKED)
      return 'This account is temporarily locked after too many failed sign-in attempts. Please try again in 15 minutes or reset your password.';
    if (e.code === ErrorCode.ACCOUNT_INACTIVE)
      return 'This account is not active. Activate it from the link in your email or contact a system administrator.';
    if (e.status === 401 || e.status === 400) return 'Invalid email or password.';
    if (e.code === NETWORK_ERROR) return e.message;
  }
  return 'Sign-in failed. Please try again.';
}

export function AuthProvider({ children, client = api }: { children: ReactNode; client?: ApiClient }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() => (client.getRefreshToken() ? 'loading' : 'anonymous'));
  const [notice, setNotice] = useState<string | null>(null);

  // Restore the session after a reload: the refresh token survives in sessionStorage.
  useEffect(() => {
    if (status !== 'loading') return;
    let cancelled = false;
    (async () => {
      try {
        const me = await client.get<UserProfile>('/me');
        if (cancelled) return;
        if (me.role === Role.STAFF) {
          client.clearTokens();
          setStatus('anonymous');
          return;
        }
        setUser(me);
        setStatus('authenticated');
      } catch {
        if (cancelled) return;
        setStatus('anonymous');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () =>
      client.onAuthLost(() => {
        setUser(null);
        setStatus('anonymous');
        setNotice('Your session has expired. Please sign in again.');
        queryClient.clear();
      }),
    [client, queryClient],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await client.post<LoginResponse>('/auth/login', { email, password }, { auth: false });
      if (res.user.role === Role.STAFF) {
        // Do not keep a staff session in the admin web; revoke the refresh token we were just given.
        client
          .post('/auth/logout', { refreshToken: res.tokens.refreshToken }, { auth: false })
          .catch(() => undefined);
        throw new LoginError(STAFF_NOT_ALLOWED);
      }
      client.setTokens(res.tokens);
      queryClient.clear();
      setNotice(null);
      setUser(res.user);
      setStatus('authenticated');
      return res.user;
    },
    [client, queryClient],
  );

  const logout = useCallback(async () => {
    const refreshToken = client.getRefreshToken();
    try {
      if (refreshToken) await client.post('/auth/logout', { refreshToken }, { auth: false });
    } catch {
      // Logging out locally is what matters; the token expires server-side anyway.
    } finally {
      client.clearTokens();
      queryClient.clear();
      setNotice(null);
      setUser(null);
      setStatus('anonymous');
    }
  }, [client, queryClient]);

  const value = useMemo(() => ({ status, user, notice, login, logout }), [status, user, notice, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
