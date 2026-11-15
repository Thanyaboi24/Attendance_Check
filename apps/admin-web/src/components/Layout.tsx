import { NavLink, Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { navFor, navLabel, roleLabel } from '../auth/roles';
import { LanguageSwitch } from '../i18n/LanguageSwitch';
import { Icon } from './icons';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => Array.from(p)[0] ?? '')
    .join('')
    .toUpperCase();
}

export function Layout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const items = navFor(user?.role);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 32 32" width="20" height="20">
              <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="3" />
              <circle cx="16" cy="16" r="4" fill="currentColor" />
            </svg>
          </span>
          <span>{t('appName')}</span>
        </div>
        <nav aria-label={t('nav.main')}>
          <ul>
            {items.map((n) => (
              <li key={n.path}>
                <NavLink to={n.path} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                  <Icon name={n.labelKey} size={18} className="nav-icon" />
                  <span>{navLabel(n)}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-foot">
          {user ? (
            <div className="user-card">
              <span className="avatar" aria-hidden>
                {initials(user.fullName)}
              </span>
              <div className="user-meta">
                <div className="user-name">{user.fullName}</div>
                <div className="user-role">{roleLabel(user.role)}</div>
              </div>
            </div>
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
