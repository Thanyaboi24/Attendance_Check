import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus, ErrorCode, type Role } from '@attendance/shared';
import { AppException, Errors } from '../common/app-exception';
import { IS_PUBLIC, ROLES, type AuthUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from './auth.service';

/**
 * Verifies the Bearer JWT and reloads the user, so a deactivated account or a changed role takes
 * effect immediately rather than when the access token expires (design §17.4).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const unauthorized = () => new AppException(HttpStatus.UNAUTHORIZED, ErrorCode.TOKEN_INVALID, 'Authentication required');
    if (!token) throw unauthorized();

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw unauthorized();
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw unauthorized();
    if (user.status !== AccountStatus.ACTIVE) {
      throw new AppException(HttpStatus.FORBIDDEN, ErrorCode.ACCOUNT_INACTIVE, 'This account is not active.');
    }
    const authUser: AuthUser = { id: user.id, role: user.role, email: user.email, fullName: user.fullName };
    req.user = authUser;
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!roles || roles.length === 0) return true;
    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user || !roles.includes(user.role)) throw Errors.forbidden();
    return true;
  }
}
