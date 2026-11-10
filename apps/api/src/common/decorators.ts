import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@attendance/shared';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';

/** Skip JWT authentication (login, refresh, password reset, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restrict a controller/handler to these roles (RBAC, design §17.4). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
  fullName: string;
}

/** The authenticated user, always taken from the verified token, never from the client body. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});
