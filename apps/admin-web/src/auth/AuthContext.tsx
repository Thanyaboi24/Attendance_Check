import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorCode, Role, type LoginResponse, type UserProfile } from '@attendance/shared';
import { api, ApiRequestError, errorMessage, NETWORK_ERROR, type ApiClient } from '../api/client';
import { t } from '../i18n';
import { en } from '../i18n/en';

/** English text of the "staff cannot use the admin web" message (tests); the UI shows `auth:errors.staffNotAllowed`. */
export const STAFF_NOT_ALLOWED: string = en.auth.errors.staffNotAllowed;

/** A sign-in refused by the admin web itself (not by the API). */
export class LoginError extends Error {
  constructor(readonly reason: 'STAFF_NOT_ALLOWED') {
    super(reason);
  }
}

/** Why the login page shows a notice (translated there, so it follows the language switch). */
export type AuthNotice = 'sessionExpired';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  user: UserProfile | null;
  /** Set when the session ended on its own (refresh failed), shown on the login page. */
  notice: AuthNotice | null;
  login(email: string, password: string): Promise<UserProfile>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function loginErrorMessage(e: unknown): string {
  if (e instanceof LoginError) return t('auth:errors.staffNotAllowed');
  if (e instanceof ApiRequestError) {
    if (e.status === 423 || e.code === ErrorCode.ACCOUNT_LOCKED) return t('auth:errors.locked');
    if (e.code === ErrorCode.ACCOUNT_INACTIVE) return t('auth:errors.inactive');
    if (e.status === 401 || e.status === 400) return t('auth:errors.invalidCredentials');
    if (e.code === NETWORK_ERROR) return errorMessage(e);
  }
  return t('auth:errors.failed');
}

export function AuthProvider({ children, client = api }: { children: ReactNode; client?: ApiClient }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() => (client.getRefreshToken() ? 'loading' : 'anonymous'));
  const [notice, setNotice] = useState<AuthNotice | null>(null);

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
        setNotice('sessionExpired');
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
        throw new LoginError('STAFF_NOT_ALLOWED');
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
