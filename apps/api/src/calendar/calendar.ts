import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Holiday, Prisma } from '@prisma/client';
import {
  AdminHolidayQuerySchema,
  CreateHolidaySchema,
  ErrorCode,
  HolidayQuerySchema,
  Role,
  UpdateHolidaySchema,
  type AdminHolidayDto,
  type AdminHolidayQuery,
  type CreateHoliday,
  type HolidayDto,
  type HolidayListResponse,
  type HolidayQuery,
  type UpdateHoliday,
} from '@attendance/shared';
import { AuditService } from '../audit/audit.service';
import { Errors } from '../common/app-exception';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { zodPipe } from '../common/zod-validation.pipe';
import { PrismaService, type Tx } from '../prisma/prisma.service';

/** `DATE` columns come back as midnight UTC; the calendar date is the first 10 characters. */
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const toDbDate = (date: string) => new Date(`${date}T00:00:00Z`);

export function toHolidayDto(h: Holiday): HolidayDto {
  return { id: h.id, date: dateOnly(h.date), nameEn: h.nameEn, nameTh: h.nameTh, type: h.type, note: h.note };
}

function toAdminHolidayDto(h: Holiday): AdminHolidayDto {
  return { ...toHolidayDto(h), createdAt: h.createdAt.toISOString(), updatedAt: h.updatedAt.toISOString() };
}

/** Holiday on a Bangkok calendar date (YYYY-MM-DD), if any. Used by attendance to close check-in. */
export function holidayOn(db: Tx | PrismaService, date: string): Promise<Holiday | null> {
  return db.holiday.findUnique({ where: { date: toDbDate(date) } });
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: HolidayQuery): Promise<HolidayListResponse> {
    const rows = await this.prisma.holiday.findMany({
      where: { date: { gte: toDbDate(q.from), lte: toDbDate(q.to) } },
      orderBy: { date: 'asc' },
    });
    return { holidays: rows.map(toHolidayDto) };
  }

  async listYear(q: AdminHolidayQuery): Promise<AdminHolidayDto[]> {
    const year = Number(q.year);
    const rows = await this.prisma.holiday.findMany({
      where: { date: { gte: toDbDate(`${year}-01-01`), lte: toDbDate(`${year}-12-31`) } },
      orderBy: { date: 'asc' },
    });
    return rows.map(toAdminHolidayDto);
  }

  async create(actorId: string, dto: CreateHoliday): Promise<AdminHolidayDto> {
    const existing = await holidayOn(this.prisma, dto.date);
    if (existing) {
      throw Errors.conflict(ErrorCode.HOLIDAY_EXISTS, 'There is already a holiday on this date', { holiday: toHolidayDto(existing) });
    }
    const created = await this.prisma.holiday.create({
      data: {
        date: toDbDate(dto.date),
        nameEn: dto.nameEn.trim(),
        nameTh: dto.nameTh.trim(),
        type: dto.type,
        note: dto.note?.trim() || null,
        createdById: actorId,
      },
    });
    await this.audit.record({ actorId, action: 'HOLIDAY_CREATED', entityType: 'Holiday', entityId: created.id, newValues: toHolidayDto(created) });
    return toAdminHolidayDto(created);
  }

  async update(actorId: string, id: string, dto: UpdateHoliday): Promise<AdminHolidayDto> {
    const before = await this.prisma.holiday.findUnique({ where: { id } });
    if (!before) throw Errors.notFound('Holiday');
    if (dto.date && dto.date !== dateOnly(before.date)) {
      const clash = await holidayOn(this.prisma, dto.date);
      if (clash) throw Errors.conflict(ErrorCode.HOLIDAY_EXISTS, 'There is already a holiday on this date', { holiday: toHolidayDto(clash) });
    }
    const data: Prisma.HolidayUpdateInput = {
      ...(dto.date ? { date: toDbDate(dto.date) } : {}),
      ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn.trim() } : {}),
      ...(dto.nameTh !== undefined ? { nameTh: dto.nameTh.trim() } : {}),
      ...(dto.type ? { type: dto.type } : {}),
      ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
    };
    const after = await this.prisma.holiday.update({ where: { id }, data });
    await this.audit.record({
      actorId,
      action: 'HOLIDAY_UPDATED',
      entityType: 'Holiday',
      entityId: id,
      previousValues: toHolidayDto(before),
      newValues: toHolidayDto(after),
    });
    return toAdminHolidayDto(after);
  }

  async remove(actorId: string, id: string): Promise<void> {
    const before = await this.prisma.holiday.findUnique({ where: { id } });
    if (!before) throw Errors.notFound('Holiday');
    await this.prisma.holiday.delete({ where: { id } });
    await this.audit.record({ actorId, action: 'HOLIDAY_DELETED', entityType: 'Holiday', entityId: id, previousValues: toHolidayDto(before) });
  }
}

/** Read-only holiday calendar for every signed-in user (the mobile app caches it for offline use). */
@ApiTags('calendar')
@ApiBearerAuth()
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('holidays')
  list(@Query(zodPipe(HolidayQuerySchema)) q: HolidayQuery) {
    return this.calendar.list(q);
  }
}

/** Holiday management for administrators (both roles). Every change is audited. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ATTENDANCE_ADMIN, Role.SYSTEM_ADMIN)
@Controller('admin/holidays')
export class AdminHolidaysController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  list(@Query(zodPipe(AdminHolidayQuerySchema)) q: AdminHolidayQuery) {
    return this.calendar.listYear(q);
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body(zodPipe(CreateHolidaySchema)) dto: CreateHoliday) {
    return this.calendar.create(actor.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() actor: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @Body(zodPipe(UpdateHolidaySchema)) dto: UpdateHoliday) {
    return this.calendar.update(actor.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@CurrentUser() actor: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.calendar.remove(actor.id, id);
    return { ok: true as const };
  }
}

@Module({ controllers: [CalendarController, AdminHolidaysController], providers: [CalendarService] })
export class CalendarModule {}
