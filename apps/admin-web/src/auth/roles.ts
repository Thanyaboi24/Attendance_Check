import { Role } from '@attendance/shared';

const AA = Role.ATTENDANCE_ADMIN;
const SA = Role.SYSTEM_ADMIN;

export interface NavItem {
  path: string;
  label: string;
  roles: readonly Role[];
}

/** Navigation and route access per role (mirrors the backend RBAC in docs/API.md, which remains authoritative). */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', roles: [AA, SA] },
  { path: '/sessions', label: 'Attendance sessions', roles: [AA] },
  { path: '/requests', label: 'Attendance requests', roles: [AA] },
  { path: '/corrections', label: 'Corrections', roles: [AA] },
  { path: '/reports', label: 'Reports', roles: [AA, SA] },
  { path: '/users', label: 'Users', roles: [SA] },
  { path: '/geofence', label: 'Geofence', roles: [AA, SA] },
  { path: '/audit-logs', label: 'Audit log', roles: [AA, SA] },
];

export const ROLE_LABEL: Record<Role, string> = {
  STAFF: 'Staff',
  ATTENDANCE_ADMIN: 'Attendance Administrator',
  SYSTEM_ADMIN: 'System Administrator',
};

export function navFor(role: Role | undefined): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((n) => n.roles.includes(role));
}

export function rolesFor(path: string): readonly Role[] {
  return NAV_ITEMS.find((n) => n.path === path)?.roles ?? [];
}

export const canEditGeofence = (role: Role | undefined) => role === SA;
export const canExportAttendance = (role: Role | undefined) => role === AA;
