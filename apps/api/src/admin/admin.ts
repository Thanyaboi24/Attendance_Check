import { Body, Controller, Get, Header, Injectable, Module, Param, ParseUUIDPipe, Patch, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import {
  AdminEditSessionSchema,
  AdminRequestQuerySchema,
  AdminSessionQuerySchema,
  AuditLogQuerySchema,
  bangkokDayBounds,
  bangkokRangeBounds,
  DateRangeQuerySchema,
  ErrorCode,
  IsoDate,
  Role,
  toBangkokDate,
  type AdminEditSession,
  type AdminRequestDetail,
  type AdminRequestDto,
  type AdminSessionDto,
  type AuditLogDto,
  type DashboardSummary,
  type Paginated,
} from '@attendance/shared';
import { toEvidenceDto, toRequestDto, toSessionDto, toUserRef } from '../attendance/mappers';
import { Errors } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { zodPipe } from '../common/zod-validation.pipe';
import { CorrectionsModule } from '../corrections/corrections';
import { SessionCorrectionService } from '../corrections/session-correction.service';
import { lockUser, PrismaService } from '../prisma/prisma.service';
import { attendanceCsv, evaluationCsv } from './csv';

type AdminSessionQuery = z.infer<typeof AdminSessionQuerySchema>;
type AdminRequestQuery = z.infer<typeof AdminRequestQuerySchema>;
type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

const userRefSelect = { id: true, staffId: true, fullName: true, department: true } as const;

function userSearch(q: string | undefined): Prisma.UserWhereInput | undefined {
  if (!q) return undefined;
  return {
    OR: [
      { fullName: { contains: q, mode: 'insensitive' } },
      { staffId: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ],
  };
}

@Injectable()
export class AdminAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly corrections: SessionCorrectionService,
  ) {}

  async sessions(q: AdminSessionQuery): Promise<Paginated<AdminSessionDto>> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const { start, end } = bangkokRangeBounds(q.from, q.to);
    const where: Prisma.AttendanceSessionWhereInput = {
      checkInAt: { gte: start, lt: end },
      ...(q.status ? { status: q.status } : {}),
      user: { ...userSearch(q.q), ...(q.department ? { department: q.department } : {}) },
    };
    const [rows, total] = await Promise.all([
      this.prisma.attendanceSession.findMany({
        where,
        include: { user: { select: userRefSelect } },
        orderBy: { checkInAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.attendanceSession.count({ where }),
    ]);
    return { items: rows.map((s) => ({ ...toSessionDto(s), user: toUserRef(s.user) })), page, pageSize, total };
  }

  async editSession(actorId: string, id: string, dto: AdminEditSession): Promise<AdminSessionDto> {
    return this.prisma.tx(async (tx) => {
      const existing = await tx.attendanceSession.findUnique({ where: { id } });
      if (!existing) throw Errors.notFound('Attendance session');
      await lockUser(tx, existing.userId);
      const session = await tx.attendanceSession.findUniqueOrThrow({ where: { id } });
      const updated = await this.corrections.apply(tx, {
        actorId,
        userId: session.userId,
        session,
        change: {
          checkInAt: dto.checkInAt ? new Date(dto.checkInAt) : undefined,
          checkOutAt: dto.checkOutAt === undefined ? undefined : dto.checkOutAt === null ? null : new Date(dto.checkOutAt),
        },
        reason: dto.reason,
        action: 'SESSION_CORRECTED',
      });
      const user = await tx.user.findUniqueOrThrow({ where: { id: updated.userId }, select: userRefSelect });
      return { ...toSessionDto(updated), user: toUserRef(user) };
    });
  }

  async requests(q: AdminRequestQuery): Promise<Paginated<AdminRequestDto>> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const range = q.from && q.to ? bangkokRangeBounds(q.from, q.to) : null;
    const where: Prisma.AttendanceRequestWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(range ? { createdAt: { gte: range.start, lt: range.end } } : {}),
      ...(q.q ? { user: userSearch(q.q) } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.attendanceRequest.findMany({
        where,
        include: { user: { select: userRefSelect } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.attendanceRequest.count({ where }),
    ]);
    return { items: rows.map((r) => ({ ...toRequestDto(r), user: toUserRef(r.user) })), page, pageSize, total };
  }

  async requestDetail(id: string): Promise<AdminRequestDetail> {
    const r = await this.prisma.attendanceRequest.findUnique({
      where: { id },
      include: { user: { select: userRefSelect }, evidence: { orderBy: { receivedAt: 'asc' } }, config: true },
    });
    if (!r) throw Errors.notFound('Attendance request');
    return {
      ...toRequestDto(r),
      user: toUserRef(r.user),
      evidence: r.evidence.map(toEvidenceDto),
      device: r.deviceModel ? { model: r.deviceModel, os: r.deviceOs ?? '', appVersion: r.appVersion ?? '' } : null,
      userConfirmedAt: r.userConfirmedAt?.toISOString() ?? null,
      clientRecordedAt: r.clientRecordedAt?.toISOString() ?? null,
      config: {
        version: r.config.version,
        centerLat: r.config.centerLat,
        centerLng: r.config.centerLng,
        radiusM: r.config.radiusM,
        maxLocationAgeSec: r.config.maxLocationAgeSec,
        maxAccuracyM: r.config.maxAccuracyM,
      },
    };
  }

  async summary(): Promise<DashboardSummary> {
    const now = this.clock.now();
    const date = toBangkokDate(now);
    const { start, end } = bangkokDayBounds(date);
    const unresolvedSince = new Date(now.getTime() - 30 * 86_400_000);
    const [activeStaff, checkedInNow, checkedInToday, automatic, manual, unresolved, pendingCorrections, longOpen] =
      await Promise.all([
        this.prisma.user.count({ where: { role: 'STAFF', status: 'ACTIVE' } }),
        this.prisma.attendanceSession.count({ where: { status: 'OPEN' } }),
        this.prisma.attendanceSession
          .groupBy({ by: ['userId'], where: { checkInAt: { gte: start, lt: end } } })
          .then((g) => g.length),
        this.prisma.attendanceRequest.count({ where: { method: 'AUTOMATIC', approvedAt: { gte: start, lt: end } } }),
        this.prisma.attendanceRequest.count({ where: { method: 'MANUAL', approvedAt: { gte: start, lt: end } } }),
        this.prisma.attendanceRequest.count({ where: { status: 'UNRESOLVED', createdAt: { gte: unresolvedSince } } }),
        this.prisma.correctionRequest.count({ where: { status: 'PENDING' } }),
        this.prisma.attendanceSession.count({ where: { status: 'OPEN', checkInAt: { lt: start } } }),
      ]);
    return {
      date,
      activeStaff,
      checkedInNow,
      checkedInToday,
      automaticActionsToday: automatic,
      manualActionsToday: manual,
      unresolvedRequests: unresolved,
      pendingCorrections,
      longOpenSessions: longOpen,
    };
  }

  async auditLogs(q: AuditLogQuery): Promise<Paginated<AuditLogDto>> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const where: Prisma.AuditLogWhereInput = {
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.action ? { action: q.action } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items: rows.map((a) => ({
        id: a.id,
        actor: a.actor,
        actorType: a.actorType,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        previousValues: a.previousValues ?? null,
        newValues: a.newValues ?? null,
        reason: a.reason,
        createdAt: a.createdAt.toISOString(),
      })),
      page,
      pageSize,
      total,
    };
  }

  async attendanceReport(from: string, to: string, department?: string): Promise<string> {
    const { start, end } = bangkokRangeBounds(from, to);
    const rows = await this.prisma.attendanceSession.findMany({
      where: { checkInAt: { gte: start, lt: end }, ...(department ? { user: { department } } : {}) },
      include: { user: true },
      orderBy: [{ checkInAt: 'asc' }],
    });
    return attendanceCsv(rows);
  }

  async evaluationReport(from: string, to: string): Promise<string> {
    const { start, end } = bangkokRangeBounds(from, to);
    const rows = await this.prisma.attendanceRequest.findMany({
      where: { createdAt: { gte: start, lt: end } },
      include: {
        user: true,
        config: true,
        evidence: { orderBy: { receivedAt: 'asc' } },
        notificationEvents: { orderBy: { occurredAt: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return evaluationCsv(rows);
  }
}

const ReportQuerySchema = DateRangeQuerySchema.and(z.object({ department: z.string().max(120).optional() }));
type ReportQuery = z.infer<typeof ReportQuerySchema>;
const RangeOnly = z.object({ from: IsoDate, to: IsoDate });

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminAttendanceService) {}

  @Get('dashboard/summary')
  @Roles(Role.ATTENDANCE_ADMIN, Role.SYSTEM_ADMIN)
  summary() {
    return this.admin.summary();
  }

  @Get('attendance/sessions')
  @Roles(Role.ATTENDANCE_ADMIN)
  sessions(@Query(zodPipe(AdminSessionQuerySchema)) q: AdminSessionQuery) {
    return this.admin.sessions(q);
  }

  @Patch('attendance/sessions/:id')
  @Roles(Role.ATTENDANCE_ADMIN)
  edit(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(zodPipe(AdminEditSessionSchema)) dto: AdminEditSession,
  ) {
    return this.admin.editSession(user.id, id, dto);
  }

  @Get('attendance/requests')
  @Roles(Role.ATTENDANCE_ADMIN)
  requests(@Query(zodPipe(AdminRequestQuerySchema)) q: AdminRequestQuery) {
    return this.admin.requests(q);
  }

  @Get('attendance/requests/:id')
  @Roles(Role.ATTENDANCE_ADMIN)
  request(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.admin.requestDetail(id);
  }

  @Get('audit-logs')
  @Roles(Role.ATTENDANCE_ADMIN, Role.SYSTEM_ADMIN)
  audit(@Query(zodPipe(AuditLogQuerySchema)) q: AuditLogQuery) {
    return this.admin.auditLogs(q);
  }

  @Get('reports/attendance.csv')
  @Roles(Role.ATTENDANCE_ADMIN)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async attendanceCsv(@Query(zodPipe(ReportQuerySchema)) q: ReportQuery, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Content-Disposition', `attachment; filename="attendance_${q.from}_${q.to}.csv"`);
    return this.admin.attendanceReport(q.from, q.to, q.department);
  }

  @Get('reports/evaluation.csv')
  @Roles(Role.ATTENDANCE_ADMIN, Role.SYSTEM_ADMIN)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async evaluationCsv(@Query(zodPipe(RangeOnly)) q: { from: string; to: string }, @Res({ passthrough: true }) res: Response) {
    if (q.from > q.to) throw Errors.badRequest(ErrorCode.VALIDATION_FAILED, 'from must not be after to');
    res.setHeader('Content-Disposition', `attachment; filename="evaluation_${q.from}_${q.to}.csv"`);
    return this.admin.evaluationReport(q.from, q.to);
  }
}

@Module({
  imports: [CorrectionsModule],
  controllers: [AdminController],
  providers: [AdminAttendanceService],
})
export class AdminModule {}
