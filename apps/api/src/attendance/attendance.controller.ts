import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  AutoAttendanceSchema,
  CancelAttendanceSchema,
  ConfirmAttendanceSchema,
  CreateAttendanceRequestSchema,
  HistoryQuerySchema,
  NotificationEventSchema,
  Role,
  UnresolvedAttendanceSchema,
  type AutoAttendance,
  type CancelAttendance,
  type ConfirmAttendance,
  type CreateAttendanceRequest,
  type HistoryQuery,
  type NotificationEventInput,
  type UnresolvedAttendance,
} from '@attendance/shared';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { assertIdempotencyKey, IdempotencyKey } from '../common/idempotency';
import { zodPipe } from '../common/zod-validation.pipe';
import { AttendanceService } from './attendance.service';

const uuid = new ParseUUIDPipe({ version: undefined });

/** Staff-only attendance endpoints. User id always comes from the token (design §17.4). */
@ApiTags('attendance')
@ApiBearerAuth()
@Roles(Role.STAFF)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('state')
  state(@CurrentUser() user: AuthUser) {
    return this.attendance.state(user.id);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser, @Query(zodPipe(HistoryQuerySchema)) q: HistoryQuery) {
    return this.attendance.history(user.id, q);
  }

  @Post('requests')
  async create(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() key: string | undefined,
    @Body(zodPipe(CreateAttendanceRequestSchema)) dto: CreateAttendanceRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertIdempotencyKey(key, dto.requestId);
    const { created, request } = await this.attendance.createRequest(user.id, dto);
    res.status(created ? 201 : 200);
    return request;
  }

  @Post('requests/:id/confirm')
  @HttpCode(200)
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @IdempotencyKey() key: string | undefined,
    @Body(zodPipe(ConfirmAttendanceSchema)) dto: ConfirmAttendance,
  ) {
    assertIdempotencyKey(key, id);
    return this.attendance.confirm(user.id, id, dto);
  }

  @Post('requests/:id/auto')
  @HttpCode(200)
  auto(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @IdempotencyKey() key: string | undefined,
    @Body(zodPipe(AutoAttendanceSchema)) dto: AutoAttendance,
  ) {
    assertIdempotencyKey(key, id);
    return this.attendance.auto(user.id, id, dto);
  }

  @Post('requests/:id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @IdempotencyKey() key: string | undefined,
    @Body(zodPipe(CancelAttendanceSchema)) dto: CancelAttendance,
  ) {
    assertIdempotencyKey(key, id);
    return this.attendance.cancel(user.id, id, dto);
  }

  @Post('requests/:id/unresolved')
  @HttpCode(200)
  unresolved(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @IdempotencyKey() key: string | undefined,
    @Body(zodPipe(UnresolvedAttendanceSchema)) dto: UnresolvedAttendance,
  ) {
    assertIdempotencyKey(key, id);
    return this.attendance.unresolved(user.id, id, dto);
  }
}

@ApiTags('attendance')
@ApiBearerAuth()
@Roles(Role.STAFF)
@Controller('notification-events')
export class NotificationEventsController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post()
  @HttpCode(200)
  async record(@CurrentUser() user: AuthUser, @Body(zodPipe(NotificationEventSchema)) dto: NotificationEventInput) {
    await this.attendance.recordNotificationEvent(user.id, dto);
    return { ok: true as const };
  }
}

@Module({
  controllers: [AttendanceController, NotificationEventsController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
