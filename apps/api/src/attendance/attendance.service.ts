import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  AttendanceRequest,
  AttendanceSession,
  GeofenceConfiguration,
  LocationEvidence,
  Method,
  RequestStatus,
} from '@prisma/client';
import {
  bangkokDayBounds,
  bangkokRangeBounds,
  classify,
  decideAuto,
  decideManual,
  decideRevalidation,
  deriveAttendanceState,
  ErrorCode,
  GRACE_CLOCK_SKEW_SEC,
  graceExpired,
  RequestType,
  toBangkokDate,
  type AttendanceActionResult,
  type AttendanceRequestDto,
  type AttendanceStateResponse,
  type AutoAttendance,
  type CancelAttendance,
  type ConfirmAttendance,
  type CreateAttendanceRequest,
  type DeviceInfo,
  type EvidenceInput,
  type HistoryQuery,
  type HistoryResponse,
  type NotificationEventInput,
  type UnresolvedAttendance,
} from '@attendance/shared';
import { AuditService } from '../audit/audit.service';
import { AppException, Errors } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import { ENV, type Env } from '../config/env';
import { lockUser, PrismaService, type Tx } from '../prisma/prisma.service';
import { toActionResult, toRequestDto, toSessionDto } from './mappers';

type Stage = 'CONFIRM' | 'AUTO' | 'CANCEL' | 'UNRESOLVED';

/** Anchor for the grace deadline may not be more than this far in the past (offline creation). */
const MAX_DEADLINE_ANCHOR_AGE_MS = 60 * 60 * 1000;

interface ActionContext {
  tx: Tx;
  req: AttendanceRequest;
  config: GeofenceConfiguration;
  now: Date;
  openSession: AttendanceSession | null;
}

/**
 * An action either produces a committed result, or an error that must be raised *after* the
 * transaction commits (so the evidence that explains the rejection is kept for review).
 */
type Outcome = { kind: 'result'; result: AttendanceActionResult } | { kind: 'error'; error: AppException };

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Mock (fake GPS) evidence is rejected unless explicitly allowed for emulator testing in development. */
  private rejectMock(ev: LocationEvidence): boolean {
    return ev.isMock && !this.env.ALLOW_MOCK_LOCATION;
  }

  // ---------------------------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------------------------

  async state(userId: string): Promise<AttendanceStateResponse> {
    const now = this.clock.now();
    const { start, end } = bangkokDayBounds(toBangkokDate(now));
    const [openSession, activeRequest, todaySessions, config] = await Promise.all([
      this.prisma.attendanceSession.findFirst({ where: { userId, status: 'OPEN' } }),
      this.prisma.attendanceRequest.findFirst({ where: { userId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }),
      this.prisma.attendanceSession.findMany({
        where: { userId, OR: [{ checkInAt: { gte: start, lt: end } }, { status: 'OPEN' }] },
        orderBy: { checkInAt: 'asc' },
      }),
      this.prisma.geofenceConfiguration.findFirst({ orderBy: { version: 'desc' }, select: { version: true } }),
    ]);
    return {
      state: deriveAttendanceState(!!openSession, activeRequest?.type ?? null),
      openSession: openSession ? toSessionDto(openSession) : null,
      activeRequest: activeRequest ? toRequestDto(activeRequest) : null,
      todaySessions: todaySessions.map(toSessionDto),
      activeConfigVersion: config?.version ?? null,
      serverTime: now.toISOString(),
    };
  }

  async history(userId: string, q: HistoryQuery): Promise<HistoryResponse> {
    const { start, end } = bangkokRangeBounds(q.from, q.to);
    const [sessions, issues] = await Promise.all([
      this.prisma.attendanceSession.findMany({
        where: { userId, checkInAt: { gte: start, lt: end } },
        orderBy: { checkInAt: 'desc' },
      }),
      this.prisma.attendanceRequest.findMany({
        where: { userId, status: 'UNRESOLVED', createdAt: { gte: start, lt: end } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { sessions: sessions.map(toSessionDto), issues: issues.map(toRequestDto) };
  }

  // ---------------------------------------------------------------------------------------------
  // Create request (geofence transition reported by the phone)
  // ---------------------------------------------------------------------------------------------

  async createRequest(
    userId: string,
    dto: CreateAttendanceRequest,
  ): Promise<{ created: boolean; request: AttendanceRequestDto }> {
    return this.prisma.tx(async (tx) => {
      await lockUser(tx, userId);
      const existing = await tx.attendanceRequest.findUnique({ where: { id: dto.requestId } });
      if (existing) {
        if (existing.userId !== userId) throw Errors.conflict(ErrorCode.ACTIVE_REQUEST_EXISTS, 'Request identifier already used');
        return { created: false, request: toRequestDto(existing) }; // idempotent replay
      }

      const config = await tx.geofenceConfiguration.findUnique({ where: { version: dto.configVersion } });
      if (!config) throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.CONFIG_VERSION_UNKNOWN, 'Unknown configuration version');

      const now = this.clock.now();
      const openSession = await tx.attendanceSession.findFirst({ where: { userId, status: 'OPEN' } });
      if (dto.type === RequestType.CHECK_IN && openSession) {
        throw Errors.conflict(ErrorCode.SESSION_ALREADY_OPEN, 'You are already checked in', { openSession: toSessionDto(openSession) });
      }
      if (dto.type === RequestType.CHECK_OUT && !openSession) {
        throw Errors.conflict(ErrorCode.NO_OPEN_SESSION, 'There is no open session to check out from');
      }

      const active = await tx.attendanceRequest.findFirst({ where: { userId, status: 'ACTIVE' } });
      if (active) {
        if (active.deadlineAt <= now) {
          await tx.attendanceRequest.update({
            where: { id: active.id },
            data: { status: 'UNRESOLVED', resolutionReason: 'SUPERSEDED', resolvedAt: now },
          });
        } else {
          throw Errors.conflict(ErrorCode.ACTIVE_REQUEST_EXISTS, 'Another attendance request is still pending', {
            activeRequest: toRequestDto(active),
          });
        }
      }

      const anchorRaw = Date.parse(dto.notificationPostedAt ?? dto.geofenceDetectedAt);
      const anchor = Math.min(now.getTime(), Math.max(now.getTime() - MAX_DEADLINE_ANCHOR_AGE_MS, anchorRaw));
      const created = await tx.attendanceRequest.create({
        data: {
          id: dto.requestId,
          userId,
          type: dto.type,
          sessionId: dto.type === RequestType.CHECK_OUT ? openSession!.id : null,
          configVersion: config.version,
          geofenceDetectedAt: new Date(dto.geofenceDetectedAt),
          notificationStatus: dto.notificationStatus,
          notificationPostedAt: dto.notificationPostedAt ? new Date(dto.notificationPostedAt) : null,
          deadlineAt: new Date(anchor + config.gracePeriodSec * 1000),
          createdAt: now,
          ...deviceFields(dto.device),
        },
      });
      return { created: true, request: toRequestDto(created) };
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Actions (design §17.6): atomic, idempotent, server re-classification
  // ---------------------------------------------------------------------------------------------

  confirm(userId: string, requestId: string, dto: ConfirmAttendance): Promise<AttendanceActionResult> {
    return this.process(userId, requestId, async (ctx) => {
      const extra = {
        userConfirmedAt: new Date(dto.userConfirmedAt),
        clientRecordedAt: new Date(dto.clientRecordedAt),
        ...deviceFields(dto.device),
      };
      const ev = await this.storeEvidence(ctx, 'CONFIRM', dto.evidence);
      if (this.rejectMock(ev)) return this.finish(ctx, 'REJECTED', 'MOCK_LOCATION', ev, extra);

      const d = decideManual({ request: ctx.req, hasOpenSession: !!ctx.openSession, locationClass: ev.classification });
      switch (d.kind) {
        case 'SUBMIT_MANUAL':
          return this.approve(ctx, 'MANUAL', ev, extra);
        case 'REJECT':
          if (d.reason === 'INVALID_STATE') return this.finish(ctx, 'REJECTED', invalidStateReason(ctx.req), ev, extra);
          // Not confirmed: keep the request ACTIVE so the user can retry or file a correction.
          await ctx.tx.attendanceRequest.update({ where: { id: ctx.req.id }, data: extra });
          return {
            kind: 'error',
            error: Errors.unprocessable(ErrorCode.LOCATION_NOT_CONFIRMED, notConfirmedMessage(ctx.req.type), {
              classification: ev.classification,
              distanceM: ev.distanceM,
              radiusM: ctx.config.radiusM,
            }),
          };
        default:
          return this.finish(ctx, 'REJECTED', 'REQUEST_NOT_ACTIVE', ev, extra);
      }
    });
  }

  auto(userId: string, requestId: string, dto: AutoAttendance): Promise<AttendanceActionResult> {
    return this.process(userId, requestId, async (ctx) => {
      // The grace period is checked against server time (with a small skew allowance).
      if (!graceExpired(ctx.req.deadlineAt.toISOString(), ctx.now, GRACE_CLOCK_SKEW_SEC)) {
        return {
          kind: 'error',
          error: Errors.conflict(ErrorCode.GRACE_PERIOD_NOT_EXPIRED, 'The grace period has not expired yet', {
            deadlineAt: ctx.req.deadlineAt.toISOString(),
          }),
        };
      }
      const extra = {
        clientRecordedAt: new Date(dto.clientRecordedAt),
        locationAttempts: dto.locationAttempts ?? 1,
        ...deviceFields(dto.device),
      };
      const ev = await this.storeEvidence(ctx, 'AUTO', dto.evidence);
      if (this.rejectMock(ev)) return this.finish(ctx, 'REJECTED', 'MOCK_LOCATION', ev, extra);

      const d = decideAuto({
        request: {
          type: ctx.req.type,
          status: ctx.req.status,
          notificationStatus: ctx.req.notificationStatus,
          notificationPostedAt: ctx.req.notificationPostedAt?.toISOString() ?? null,
          deadlineAt: ctx.req.deadlineAt.toISOString(),
        },
        hasOpenSession: !!ctx.openSession,
        locationClass: ev.classification,
        now: ctx.now,
        // The phone already retried uncertain fixes; the server decides on the evidence it received.
        maxRetries: 0,
        clockSkewSec: GRACE_CLOCK_SKEW_SEC,
      });
      switch (d.kind) {
        case 'SUBMIT_AUTO':
          return this.approve(ctx, 'AUTOMATIC', ev, extra);
        case 'CANCEL':
          return this.finish(ctx, 'CANCELLED', d.reason, ev, extra);
        case 'UNRESOLVED':
          if (d.reason === 'INVALID_STATE') return this.finish(ctx, 'REJECTED', invalidStateReason(ctx.req), ev, extra);
          return this.finish(ctx, 'UNRESOLVED', d.reason, ev, extra);
        default:
          // WAIT / NEED_LOCATION / RETRY_LOCATION / SKIP cannot occur after the checks above.
          return this.finish(ctx, 'UNRESOLVED', 'UNCERTAIN_LOCATION', ev, extra);
      }
    });
  }

  cancel(userId: string, requestId: string, dto: CancelAttendance): Promise<AttendanceActionResult> {
    return this.process(userId, requestId, async (ctx) => {
      const extra = { clientRecordedAt: new Date(dto.clientRecordedAt) };
      const ev = await this.storeEvidence(ctx, 'CANCEL', dto.evidence);
      if (this.rejectMock(ev)) return this.finish(ctx, 'REJECTED', 'MOCK_LOCATION', ev, extra);
      if (decideRevalidation(ctx.req.type, ev.classification) === 'CANCEL') {
        return this.finish(ctx, 'CANCELLED', dto.reason, ev, extra);
      }
      return {
        kind: 'error',
        error: Errors.unprocessable(
          ErrorCode.LOCATION_NOT_CONFIRMED,
          'The location does not confirm the opposite side; the request stays pending',
          { classification: ev.classification, distanceM: ev.distanceM, radiusM: ctx.config.radiusM },
        ),
      };
    });
  }

  unresolved(userId: string, requestId: string, dto: UnresolvedAttendance): Promise<AttendanceActionResult> {
    return this.process(userId, requestId, async (ctx) => {
      const ev = dto.evidence ? await this.storeEvidence(ctx, 'UNRESOLVED', dto.evidence) : null;
      return this.finish(ctx, 'UNRESOLVED', dto.reason, ev, { clientRecordedAt: new Date(dto.clientRecordedAt) });
    });
  }

  async recordNotificationEvent(userId: string, dto: NotificationEventInput): Promise<void> {
    const req = await this.prisma.attendanceRequest.findUnique({ where: { id: dto.requestId }, select: { userId: true } });
    if (!req || req.userId !== userId) throw Errors.notFound('Attendance request');
    await this.prisma.notificationEvent.create({
      data: {
        requestId: dto.requestId,
        userId,
        type: dto.type,
        occurredAt: new Date(dto.occurredAt),
        action: dto.action ?? null,
        detail: dto.detail ?? null,
      },
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------------------------

  private async process(
    userId: string,
    requestId: string,
    handler: (ctx: ActionContext) => Promise<Outcome>,
  ): Promise<AttendanceActionResult> {
    const outcome = await this.prisma.tx<Outcome>(async (tx) => {
      // Serialise every attendance write of this user, then lock the request row itself.
      await lockUser(tx, userId);
      await tx.$queryRaw`SELECT 1 FROM "AttendanceRequest" WHERE "id" = ${requestId}::uuid FOR UPDATE`;
      const req = await tx.attendanceRequest.findUnique({ where: { id: requestId }, include: { config: true } });
      if (!req || req.userId !== userId) throw Errors.notFound('Attendance request');

      if (req.status !== 'ACTIVE') {
        // Already processed (duplicate submission, or the other of a manual/auto race): same result.
        const last = await tx.locationEvidence.findFirst({ where: { requestId }, orderBy: { receivedAt: 'desc' } });
        return { kind: 'result', result: toActionResult(req, last) };
      }
      const openSession = await tx.attendanceSession.findFirst({ where: { userId, status: 'OPEN' } });
      const { config, ...plain } = req;
      return handler({ tx, req: plain, config, now: this.clock.now(), openSession });
    });
    if (outcome.kind === 'error') throw outcome.error;
    return outcome.result;
  }

  /** The server recomputes distance and classification; the client's values are kept only for comparison. */
  private storeEvidence(ctx: ActionContext, stage: Stage, input: EvidenceInput): Promise<LocationEvidence> {
    const c = classify(
      { lat: input.lat, lng: input.lng, accuracyM: input.accuracyM, measuredAt: input.measuredAt },
      ctx.config,
      ctx.now,
    );
    return ctx.tx.locationEvidence.create({
      data: {
        requestId: ctx.req.id,
        stage,
        lat: input.lat,
        lng: input.lng,
        measuredAt: new Date(input.measuredAt),
        accuracyM: input.accuracyM,
        isMock: input.isMock ?? false,
        distanceM: c.distanceM,
        classification: c.classification,
        clientDistanceM: input.clientDistanceM ?? null,
        clientClassification: input.clientClassification ?? null,
        receivedAt: ctx.now,
      },
    });
  }

  private async approve(
    ctx: ActionContext,
    method: Method,
    ev: LocationEvidence,
    extra: Record<string, unknown>,
  ): Promise<Outcome> {
    const { tx, req, now, openSession } = ctx;
    let sessionId: string;
    if (req.type === 'CHECK_IN') {
      const session = await tx.attendanceSession.create({
        data: { userId: req.userId, checkInAt: now, checkInMethod: method, status: 'OPEN' },
      });
      sessionId = session.id;
      await this.audit.record(
        { actorId: req.userId, action: 'CHECK_IN', entityType: 'AttendanceSession', entityId: session.id, newValues: toSessionDto(session) },
        tx,
      );
    } else {
      const session = await tx.attendanceSession.update({
        where: { id: openSession!.id },
        data: { checkOutAt: now, checkOutMethod: method, status: 'COMPLETED' },
      });
      sessionId = session.id;
      await this.audit.record(
        {
          actorId: req.userId,
          action: 'CHECK_OUT',
          entityType: 'AttendanceSession',
          entityId: session.id,
          previousValues: toSessionDto(openSession!),
          newValues: toSessionDto(session),
        },
        tx,
      );
    }
    const updated = await tx.attendanceRequest.update({
      where: { id: req.id },
      data: { ...extra, status: 'APPROVED', method, approvedAt: now, resolvedAt: now, sessionId },
    });
    return { kind: 'result', result: toActionResult(updated, ev) };
  }

  private async finish(
    ctx: ActionContext,
    status: Exclude<RequestStatus, 'ACTIVE' | 'APPROVED'>,
    reason: string,
    ev: LocationEvidence | null,
    extra: Record<string, unknown>,
  ): Promise<Outcome> {
    const updated = await ctx.tx.attendanceRequest.update({
      where: { id: ctx.req.id },
      data: { ...extra, status, resolutionReason: reason, resolvedAt: ctx.now },
    });
    return { kind: 'result', result: toActionResult(updated, ev) };
  }
}

function deviceFields(device: DeviceInfo | undefined) {
  return device ? { deviceModel: device.model, deviceOs: device.os, appVersion: device.appVersion } : {};
}

function invalidStateReason(req: AttendanceRequest): string {
  return req.type === 'CHECK_IN' ? ErrorCode.SESSION_ALREADY_OPEN : ErrorCode.NO_OPEN_SESSION;
}

function notConfirmedMessage(type: AttendanceRequest['type']): string {
  return type === 'CHECK_IN'
    ? 'Your location could not be confirmed inside the faculty area. Please retry, or submit a correction request.'
    : 'Your location could not be confirmed outside the faculty area. Please retry, or submit a correction request.';
}
