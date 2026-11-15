import { Body, Controller, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma, User } from '@prisma/client';
import type { z } from 'zod';
import {
  AccountStatus,
  ApproveSignupSchema,
  ErrorCode,
  RejectSignupSchema,
  Role,
  SignupListQuerySchema,
  type ApproveSignup,
  type Paginated,
  type RejectSignup,
  type SignupDto,
} from '@attendance/shared';
import { AuditService } from '../audit/audit.service';
import { toProfile } from '../auth/auth.service';
import { Errors } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { zodPipe } from '../common/zod-validation.pipe';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { toAdminUserDto } from '../users/users';

type SignupListQuery = z.infer<typeof SignupListQuerySchema>;
type UserWithReviewer = User & { reviewedBy: Pick<User, 'id' | 'fullName'> | null };

export function toSignupDto(u: UserWithReviewer): SignupDto {
  return {
    ...toAdminUserDto(u),
    reviewedAt: u.reviewedAt?.toISOString() ?? null,
    reviewedBy: u.reviewedBy ? { id: u.reviewedBy.id, fullName: u.reviewedBy.fullName } : null,
    reviewNote: u.reviewNote,
  };
}

const withReviewer = { reviewedBy: { select: { id: true, fullName: true } } } as const;

/** Review of staff self-registrations (sign-up from the mobile app). */
@Injectable()
export class SignupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly clock: ClockService,
  ) {}

  async list(q: SignupListQuery): Promise<Paginated<SignupDto>> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const status = q.status ?? AccountStatus.PENDING_APPROVAL;
    const where: Prisma.UserWhereInput = {
      selfRegistered: true,
      status,
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
      this.prisma.user.findMany({
        where,
        include: withReviewer,
        // Oldest pending first (first come, first served); reviewed lists newest decision first.
        orderBy: status === AccountStatus.PENDING_APPROVAL ? { createdAt: 'asc' } : { reviewedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: items.map(toSignupDto), page, pageSize, total };
  }

  approve(actorId: string, id: string, dto: ApproveSignup): Promise<SignupDto> {
    return this.decide(actorId, id, AccountStatus.ACTIVE, dto.note?.trim() || null);
  }

  reject(actorId: string, id: string, dto: RejectSignup): Promise<SignupDto> {
    return this.decide(actorId, id, AccountStatus.REJECTED, dto.reason.trim());
  }

  private async decide(actorId: string, id: string, status: 'ACTIVE' | 'REJECTED', note: string | null): Promise<SignupDto> {
    const now = this.clock.now();
    const after = await this.prisma.tx(async (tx) => {
      const before = await tx.user.findUnique({ where: { id } });
      if (!before || !before.selfRegistered) throw Errors.notFound('Sign-up request');
      // Conditional update: two administrators deciding at the same time cannot both win.
      const changed = await tx.user.updateMany({
        where: { id, status: AccountStatus.PENDING_APPROVAL },
        data: { status, reviewedAt: now, reviewedById: actorId, reviewNote: note },
      });
      if (changed.count === 0) {
        throw Errors.conflict(ErrorCode.SIGNUP_NOT_PENDING, 'This sign-up request has already been reviewed');
      }
      const updated = await tx.user.findUniqueOrThrow({ where: { id }, include: withReviewer });
      await this.audit.record(
        {
          actorId,
          action: status === AccountStatus.ACTIVE ? 'SIGNUP_APPROVED' : 'SIGNUP_REJECTED',
          entityType: 'User',
          entityId: id,
          reason: note ?? undefined,
          previousValues: toProfile(before),
          newValues: toProfile(updated),
        },
        tx,
      );
      return updated;
    });
    await this.mail.send(
      status === AccountStatus.ACTIVE
        ? this.mail.signupApprovedMail(after.email, after.fullName, note)
        : this.mail.signupRejectedMail(after.email, after.fullName, note ?? ''),
    );
    return toSignupDto(after);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ATTENDANCE_ADMIN, Role.SYSTEM_ADMIN)
@Controller('admin/signups')
export class AdminSignupsController {
  constructor(private readonly signups: SignupsService) {}

  @Get()
  list(@Query(zodPipe(SignupListQuerySchema)) q: SignupListQuery) {
    return this.signups.list(q);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(zodPipe(ApproveSignupSchema)) dto: ApproveSignup,
  ) {
    return this.signups.approve(actor.id, id, dto);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(zodPipe(RejectSignupSchema)) dto: RejectSignup,
  ) {
    return this.signups.reject(actor.id, id, dto);
  }
}

@Module({ controllers: [AdminSignupsController], providers: [SignupsService] })
export class SignupsModule {}
