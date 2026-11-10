import { AccountStatus, RequestStatus, Role, type SessionDto, type UserProfile } from '@attendance/shared';
import { errorMessage, isApiError, isAuthError, isNetworkError } from '../errors';
import type { AppDeps } from '../ports';
import { getActiveConfig, logEvent, META_USER_ID, refreshState, safe } from './common';
import { ensureMonitoring, type MonitoringStatus, stopMonitoring } from './monitoring';
import { syncOutbox } from './syncOutbox';

export type LoginOutcome =
  | { kind: 'OK'; user: UserProfile; monitoring: MonitoringStatus }
  /** Non-STAFF accounts use the Admin Web; no tokens are kept and monitoring never starts. */
  | { kind: 'NOT_STAFF'; role: UserProfile['role'] }
  | { kind: 'INVALID_CREDENTIALS' }
  | { kind: 'ACCOUNT_LOCKED' }
  | { kind: 'ACCOUNT_INACTIVE' }
  | { kind: 'NETWORK' }
  | { kind: 'ERROR'; message: string };

export const ADMIN_WEB_MESSAGE =
  'This app is for staff attendance only. Please use the Admin Web to manage attendance, users or geofence settings.';

export async function login(deps: AppDeps, email: string, password: string): Promise<LoginOutcome> {
  let res;
  try {
    res = await deps.authApi.login({ email, password });
  } catch (e) {
    if (isApiError(e)) {
      if (e.code === 'ACCOUNT_LOCKED' || e.status === 423) return { kind: 'ACCOUNT_LOCKED' };
      if (e.code === 'ACCOUNT_INACTIVE') return { kind: 'ACCOUNT_INACTIVE' };
      if (e.status === 401 || e.code === 'INVALID_CREDENTIALS' || e.code === 'VALIDATION_FAILED') {
        return { kind: 'INVALID_CREDENTIALS' };
      }
      return { kind: 'ERROR', message: e.message };
    }
    if (isNetworkError(e)) return { kind: 'NETWORK' };
    return { kind: 'ERROR', message: errorMessage(e) };
  }

  const { user, tokens } = res;
  if (user.role !== Role.STAFF) {
    // Revoke the refresh token we just received; never persist it.
    await safe(() => deps.authApi.logout(tokens.refreshToken));
    await logEvent(deps, 'LOGIN', null, { role: user.role, accepted: false });
    return { kind: 'NOT_STAFF', role: user.role };
  }
  if (user.status !== AccountStatus.ACTIVE) return { kind: 'ACCOUNT_INACTIVE' };

  // A different staff member on this phone: drop the previous user's local data.
  const previousUser = await deps.store.getMeta(META_USER_ID);
  if (previousUser && previousUser !== user.id) await deps.store.clearUserData();
  await deps.store.setMeta(META_USER_ID, user.id);

  await deps.session.setTokens(tokens);
  await deps.session.setUser(user);
  await logEvent(deps, 'LOGIN', null, { role: user.role, accepted: true });

  const monitoring = await startAfterSignIn(deps, { force: true });
  return { kind: 'OK', user, monitoring };
}

async function startAfterSignIn(deps: AppDeps, opts: { force: boolean }): Promise<MonitoringStatus> {
  const cfg = await getActiveConfig(deps, { refresh: true });
  await refreshState(deps);
  const status = await ensureMonitoring(deps, cfg, opts);
  await safe(() => syncOutbox(deps));
  return status;
}

export type LogoutOutcome =
  /** An open session exists: the UI must warn that monitoring stops and no automatic check-out will happen. */
  | { kind: 'NEEDS_CONFIRMATION'; openSession: SessionDto | null; pendingRequest: boolean; unsyncedCount: number }
  | { kind: 'LOGGED_OUT'; discardedUnsynced: number };

/**
 * Logout (design §9.5, scenario 19): warn when a session is open (no automatic check-out), try to sync, then stop
 * geofencing, cancel every scheduled job, dismiss notifications and clear tokens.
 */
export async function logout(deps: AppDeps, opts: { confirmed: boolean }): Promise<LogoutOutcome> {
  const snapshot = await deps.store.getSnapshot();
  const open = await deps.store.listOpenRequests();
  const unsynced = (await deps.store.listOutbox()).filter((e) => e.status === 'PENDING').length;
  const needsWarning = snapshot?.openSession != null || open.length > 0 || unsynced > 0;
  if (needsWarning && !opts.confirmed) {
    return {
      kind: 'NEEDS_CONFIRMATION',
      openSession: snapshot?.openSession ?? null,
      pendingRequest: open.some((r) => r.status === RequestStatus.ACTIVE),
      unsyncedCount: unsynced,
    };
  }

  // Last chance to deliver queued decisions while we still have a token.
  const sync = await safe(() => syncOutbox(deps));
  const discardedUnsynced = sync?.remaining ?? unsynced;

  await stopMonitoring(deps);
  await safe(() => deps.scheduler.cancelAll());
  await safe(() => deps.notifier.dismissAll());
  const tokens = await deps.session.getTokens();
  if (tokens) await safe(() => deps.authApi.logout(tokens.refreshToken));
  await deps.session.clear();
  await deps.store.clearUserData();
  await deps.store.setMeta(META_USER_ID, null);
  await logEvent(deps, 'LOGOUT', null, { hadOpenSession: snapshot?.openSession != null, discardedUnsynced });
  return { kind: 'LOGGED_OUT', discardedUnsynced };
}

export type BootstrapOutcome =
  | { kind: 'SIGNED_OUT' }
  | { kind: 'NOT_STAFF' }
  | { kind: 'SIGNED_IN'; user: UserProfile; monitoring: MonitoringStatus; online: boolean };

/**
 * App start / foreground / device boot (BootTask): validate the session, refresh config and state,
 * re-register the geofence when needed, re-schedule grace jobs of pending requests and sync the outbox.
 */
export async function bootstrap(deps: AppDeps, opts: { reason: 'APP_START' | 'FOREGROUND' | 'BOOT' }): Promise<BootstrapOutcome> {
  const tokens = await deps.session.getTokens();
  if (!tokens) {
    await stopMonitoring(deps);
    return { kind: 'SIGNED_OUT' };
  }

  let user = await deps.session.getUser();
  let online = true;
  try {
    const me = await deps.authApi.me();
    user = me;
    await deps.session.setUser(me);
  } catch (e) {
    if (isAuthError(e) || (isApiError(e) && (e.status === 401 || e.code === 'ACCOUNT_INACTIVE'))) {
      // Refresh token rejected or account deactivated: monitoring must stop.
      await stopMonitoring(deps);
      await safe(() => deps.scheduler.cancelAll());
      await deps.session.clear();
      return { kind: 'SIGNED_OUT' };
    }
    online = false;
  }
  if (!user) return { kind: 'SIGNED_OUT' };
  if (user.role !== Role.STAFF) {
    await stopMonitoring(deps);
    await deps.session.clear();
    return { kind: 'NOT_STAFF' };
  }

  const cfg = await getActiveConfig(deps, { refresh: online });
  if (online) await refreshState(deps);
  const monitoring = await ensureMonitoring(deps, cfg, { force: opts.reason === 'BOOT' });

  // Re-schedule grace jobs (WorkManager KEEP makes this a no-op when the job is still pending).
  const now = deps.clock.now().getTime();
  for (const r of await deps.store.listOpenRequests()) {
    if (r.localAction) continue;
    await safe(() => deps.scheduler.schedule(r.requestId, Math.max(0, Date.parse(r.deadlineAt) - now)));
  }
  if (online) await safe(() => syncOutbox(deps));
  await logEvent(deps, 'BOOTSTRAP', null, { reason: opts.reason, online, monitoring: monitoring.active, missing: monitoring.missing });
  return { kind: 'SIGNED_IN', user, monitoring, online };
}
