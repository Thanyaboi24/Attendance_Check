import { Role } from '@attendance/shared';
import { t } from '../i18n';
import type { en } from '../i18n/en';

const AA = Role.ATTENDANCE_ADMIN;
const SA = Role.SYSTEM_ADMIN;

export type NavKey = Exclude<keyof (typeof en)['common']['nav'], 'main'>;

export interface NavItem {
  path: string;
  /** Key under `common:nav`; translate at render time with `navLabel`. */
  labelKey: NavKey;
  roles: readonly Role[];
}

/** Navigation and route access per role (mirrors the backend RBAC in docs/API.md, which remains authoritative). */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/dashboard', labelKey: 'dashboard', roles: [AA, SA] },
  { path: '/signups', labelKey: 'signups', roles: [AA, SA] },
  { path: '/sessions', labelKey: 'sessions', roles: [AA] },
  { path: '/requests', labelKey: 'requests', roles: [AA] },
  { path: '/corrections', labelKey: 'corrections', roles: [AA] },
  { path: '/reports', labelKey: 'reports', roles: [AA, SA] },
  { path: '/users', labelKey: 'users', roles: [SA] },
  { path: '/geofence', labelKey: 'geofence', roles: [AA, SA] },
  { path: '/holidays', labelKey: 'holidays', roles: [AA, SA] },
  { path: '/audit-logs', labelKey: 'auditLog', roles: [AA, SA] },
];

/** Navigation label in the current language. */
export const navLabel = (n: NavItem): string => t(`common:nav.${n.labelKey}`);

/** Role name in the current language (looked up at render time). */
export const roleLabel = (role: Role): string => t(`common:role.${role}`);

export function navFor(role: Role | undefined): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((n) => n.roles.includes(role));
}

export function rolesFor(path: string): readonly Role[] {
  return NAV_ITEMS.find((n) => n.path === path)?.roles ?? [];
}

export const canEditGeofence = (role: Role | undefined) => role === SA;
export const canExportAttendance = (role: Role | undefined) => role === AA;
