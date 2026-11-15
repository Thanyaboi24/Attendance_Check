import { NavLink, Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { navFor, navLabel, roleLabel } from '../auth/roles';
import { LanguageSwitch } from '../i18n/LanguageSwitch';

export function Layout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const items = navFor(user?.role);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
            <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="3" />
            <circle cx="16" cy="16" r="4" fill="currentColor" />
          </svg>
          <span>{t('appName')}</span>
        </div>
        <nav aria-label={t('nav.main')}>
          <ul>
            {items.map((n) => (
              <li key={n.path}>
                <NavLink to={n.path} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                  {navLabel(n)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-foot">
          {user ? (
            <>
              <div className="user-name">{user.fullName}</div>
              <div className="muted small">{roleLabel(user.role)}</div>
            </>
          ) : null}
          <button type="button" className="btn btn-ghost btn-block" onClick={() => void logout()}>
            {t('actions.signOut')}
          </button>
          <LanguageSwitch className="sidebar-lang" />
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
