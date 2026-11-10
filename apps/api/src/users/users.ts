import { Body, Controller, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma, User } from '@prisma/client';
import type { z } from 'zod';
import {
  CreateUserSchema,
  ErrorCode,
  Role,
  UpdateUserSchema,
  UserListQuerySchema,
  type AdminUserDto,
  type CreateUser,
  type Paginated,
  type UpdateUser,
} from '@attendance/shared';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { AuthService, toProfile } from '../auth/auth.service';
import { Errors } from '../common/app-exception';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { zodPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

type UserListQuery = z.infer<typeof UserListQuerySchema>;

export function toAdminUserDto(u: User): AdminUserDto {
  return { ...toProfile(u), createdAt: u.createdAt.toISOString(), lastLoginAt: u.lastLoginAt?.toISOString() ?? null };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async list(q: UserListQuery): Promise<Paginated<AdminUserDto>> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const where: Prisma.UserWhereInput = {
      ...(q.role ? { role: q.role } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { fullName: { contains: q.q, mode: 'insensitive' } },
              { staffId: { contains: q.q, mode: 'insensitive' } },
              { email: { contains: q.q, mode: 'insensitive' } },
              { department: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy: { fullName: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.user.count({ where }),
    ]);
    return { items: items.map(toAdminUserDto), page, pageSize, total };
  }

  async create(actorId: string, dto: CreateUser & { email: string }): Promise<AdminUserDto> {
    const duplicate = await this.prisma.user.findFirst({ where: { OR: [{ email: dto.email }, { staffId: dto.staffId }] } });
    if (duplicate) {
      throw Errors.conflict(ErrorCode.DUPLICATE_USER, 'A user with this email or staff ID already exists');
    }
    const user = await this.prisma.user.create({ data: { ...dto, status: 'PENDING_ACTIVATION' } });
    await this.audit.record({ actorId, action: 'USER_CREATED', entityType: 'User', entityId: user.id, newValues: toProfile(user) });
    await this.auth.sendActivation(user);
    return toAdminUserDto(user);
  }

  async update(actorId: string, id: string, dto: UpdateUser): Promise<AdminUserDto> {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw Errors.notFound('User');
    if (actorId === id && ((dto.status && dto.status !== 'ACTIVE') || (dto.role && dto.role !== before.role))) {
      throw Errors.forbidden('You cannot deactivate your own account or change your own role');
    }
    if (dto.status === 'ACTIVE' && !before.passwordHash) {
      throw Errors.badRequest(ErrorCode.VALIDATION_FAILED, 'This user has not activated the account yet; resend the activation email instead');
    }
    const after = await this.prisma.user.update({ where: { id }, data: dto });
    if (after.status !== 'ACTIVE' || after.role !== before.role) await this.auth.revokeAll(id);
    await this.audit.record({
      actorId,
      action: dto.status && dto.status !== before.status ? `USER_${dto.status}` : 'USER_UPDATED',
      entityType: 'User',
      entityId: id,
      previousValues: toProfile(before),
      newValues: toProfile(after),
    });
    return toAdminUserDto(after);
  }

  async resendActivation(actorId: string, id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw Errors.notFound('User');
    if (user.status !== 'PENDING_ACTIVATION') {
      throw Errors.conflict(ErrorCode.VALIDATION_FAILED, 'This account is already activated');
    }
    await this.auth.sendActivation(user);
    await this.audit.record({ actorId, action: 'ACTIVATION_RESENT', entityType: 'User', entityId: id });
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.SYSTEM_ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query(zodPipe(UserListQuerySchema)) q: UserListQuery) {
    return this.users.list(q);
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body(zodPipe(CreateUserSchema)) dto: CreateUser & { email: string }) {
    return this.users.create(actor.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(zodPipe(UpdateUserSchema)) dto: UpdateUser,
  ) {
    return this.users.update(actor.id, id, dto);
  }

  @Post(':id/resend-activation')
  @HttpCode(200)
  async resend(@CurrentUser() actor: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.users.resendActivation(actor.id, id);
    return { ok: true as const };
  }
}

@Module({ imports: [AuthModule], controllers: [AdminUsersController], providers: [UsersService] })
export class UsersModule {}
