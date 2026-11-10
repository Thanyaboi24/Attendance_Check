import { Body, Controller, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { CorrectionRequest, User } from '@prisma/client';
import type { Response } from 'express';
import type { z } from 'zod';
import {
  AdminCorrectionQuerySchema,
  CreateCorrectionSchema,
  ErrorCode,
  ReviewCorrectionSchema,
  Role,
  type CorrectionDto,
  type CreateCorrection,
  type Paginated,
  type ReviewCorrection,
} from '@attendance/shared';
import { AuditService } from '../audit/audit.service';
import { Errors } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { assertIdempotencyKey, IdempotencyKey } from '../common/idempotency';
import { zodPipe } from '../common/zod-validation.pipe';
import { lockUser, PrismaService } from '../prisma/prisma.service';
import { SessionCorrectionService } from './session-correction.service';

type AdminCorrectionQuery = z.infer<typeof AdminCorrectionQuerySchema>;

type CorrectionWithPeople = CorrectionRequest & { user: User; reviewer: User | null };

export function toCorrectionDto(c: CorrectionWithPeople): CorrectionDto {
  return {
    id: c.id,
    user: { id: c.user.id, fullName: c.user.fullName, staffId: c.user.staffId, department: c.user.department },
    sessionId: c.sessionId,
    workDate: c.workDate,
    requestedCheckInAt: c.requestedCheckInAt?.toISOString() ?? null,
    requestedCheckOutAt: c.requestedCheckOutAt?.toISOString() ?? null,
    reason: c.reason,
    status: c.status,
    reviewNote: c.reviewNote,
    reviewer: c.reviewer ? { id: c.reviewer.id, fullName: c.reviewer.fullName } : null,
    reviewedAt: c.reviewedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

const withPeople = { user: true, reviewer: true } as const;

@Injectable()
export class CorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly audit: AuditService,
    private readonly sessions: SessionCorrectionService,
  ) {}

  async create(userId: string, dto: CreateCorrection): Promise<{ created: boolean; correction: CorrectionDto }> {
    return this.prisma.tx(async (tx) => {
      await lockUser(tx, userId);
      const existing = await tx.correctionRequest.findUnique({ where: { id: dto.correctionId }, include: withPeople });
      if (existing) {
        if (existing.userId !== userId) throw Errors.notFound('Correction request');
        return { created: false, correction: toCorrectionDto(existing) };
      }
      if (dto.sessionId) {
        const session = await tx.attendanceSession.findUnique({ where: { id: dto.sessionId } });
        if (!session || session.userId !== userId) throw Errors.notFound('Attendance session');
      }
      const created = await tx.correctionRequest.create({
        data: {
          id: dto.correctionId,
          userId,
          sessionId: dto.sessionId,
          workDate: dto.workDate,
          requestedCheckInAt: dto.requestedCheckInAt ? new Date(dto.requestedCheckInAt) : null,
          requestedCheckOutAt: dto.requestedCheckOutAt ? new Date(dto.requestedCheckOutAt) : null,
          reason: dto.reason,
        },
        include: withPeople,
      });
      await this.audit.record(
        { actorId: userId, action: 'CORRECTION_REQUESTED', entityType: 'CorrectionRequest', entityId: created.id, newValues: dto, reason: dto.reason },
        tx,
      );
      return { created: true, correction: toCorrectionDto(created) };
    });
  }

  async listOwn(userId: string): Promise<CorrectionDto[]> {
    const rows = await this.prisma.correctionRequest.findMany({
      where: { userId },
      include: withPeople,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(toCorrectionDto);
  }

  async list(q: AdminCorrectionQuery): Promise<Paginated<CorrectionDto>> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const where = q.status ? { status: q.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.correctionRequest.findMany({
        where,
        include: withPeople,
        orderBy: { createdAt: q.status === 'PENDING' ? 'asc' : 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.correctionRequest.count({ where }),
    ]);
    return { items: items.map(toCorrectionDto), page, pageSize, total };
  }

  async review(reviewerId: string, id: string, dto: ReviewCorrection): Promise<CorrectionDto> {
    return this.prisma.tx(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "CorrectionRequest" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const correction = await tx.correctionRequest.findUnique({ where: { id } });
      if (!correction) throw Errors.notFound('Correction request');
      if (correction.status !== 'PENDING') {
        throw Errors.conflict(ErrorCode.CORRECTION_NOT_PENDING, 'This correction request has already been reviewed');
      }
      const now = this.clock.now();

      let sessionId = correction.sessionId;
      if (dto.decision === 'APPROVE') {
        await lockUser(tx, correction.userId);
        const session = correction.sessionId
          ? await tx.attendanceSession.findUnique({ where: { id: correction.sessionId } })
          : null;
        const pick = (override: string | null | undefined, requested: Date | null) =>
          override !== undefined ? (override === null ? undefined : new Date(override)) : (requested ?? undefined);
        const updated = await this.sessions.apply(tx, {
          actorId: reviewerId,
          userId: correction.userId,
          session,
          change: {
            checkInAt: pick(dto.checkInAt, correction.requestedCheckInAt),
            checkOutAt: pick(dto.checkOutAt, correction.requestedCheckOutAt),
          },
          reason: dto.note,
          action: 'CORRECTION_APPROVED',
          correctionId: correction.id,
        });
        sessionId = updated.id;
      }

      const reviewed = await tx.correctionRequest.update({
        where: { id },
        data: {
          status: dto.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          reviewNote: dto.note,
          reviewerId,
          reviewedAt: now,
          sessionId,
        },
        include: withPeople,
      });
      if (dto.decision === 'REJECT') {
        await this.audit.record(
          { actorId: reviewerId, action: 'CORRECTION_REJECTED', entityType: 'CorrectionRequest', entityId: id, reason: dto.note },
          tx,
        );
      }
      return toCorrectionDto(reviewed);
    });
  }
}

@ApiTags('corrections')
@ApiBearerAuth()
@Roles(Role.STAFF)
@Controller('corrections')
export class CorrectionsController {
  constructor(private readonly corrections: CorrectionsService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() key: string | undefined,
    @Body(zodPipe(CreateCorrectionSchema)) dto: CreateCorrection,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertIdempotencyKey(key, dto.correctionId);
    const { created, correction } = await this.corrections.create(user.id, dto);
    res.status(created ? 201 : 200);
    return correction;
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.corrections.listOwn(user.id);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ATTENDANCE_ADMIN)
@Controller('admin/corrections')
export class AdminCorrectionsController {
  constructor(private readonly corrections: CorrectionsService) {}

  @Get()
  list(@Query(zodPipe(AdminCorrectionQuerySchema)) q: AdminCorrectionQuery) {
    return this.corrections.list(q);
  }

  @Post(':id/review')
  @HttpCode(200)
  review(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(zodPipe(ReviewCorrectionSchema)) dto: ReviewCorrection,
  ) {
    return this.corrections.review(user.id, id, dto);
  }
}

@Module({
  controllers: [CorrectionsController, AdminCorrectionsController],
  providers: [CorrectionsService, SessionCorrectionService],
  exports: [SessionCorrectionService],
})
export class CorrectionsModule {}
