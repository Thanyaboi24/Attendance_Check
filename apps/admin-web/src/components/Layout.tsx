import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { navFor, ROLE_LABEL } from '../auth/roles';

export function Layout() {
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
          <span>Attendance Admin</span>
        </div>
        <nav aria-label="Main">
          <ul>
            {items.map((n) => (
              <li key={n.path}>
                <NavLink to={n.path} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-foot">
          {user ? (
            <>
              <div className="user-name">{user.fullName}</div>
              <div className="muted small">{ROLE_LABEL[user.role]}</div>
            </>
          ) : null}
          <button type="button" className="btn btn-ghost btn-block" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
