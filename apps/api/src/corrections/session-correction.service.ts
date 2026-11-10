import { Injectable } from '@nestjs/common';
import type { AttendanceSession } from '@prisma/client';
import { ErrorCode } from '@attendance/shared';
import { toSessionDto } from '../attendance/mappers';
import { AuditService } from '../audit/audit.service';
import { Errors } from '../common/app-exception';
import type { Tx } from '../prisma/prisma.service';

export interface SessionChange {
  checkInAt?: Date;
  /** null re-opens the session (removes the check-out). */
  checkOutAt?: Date | null;
}

/**
 * Applies an administrative correction to a session. Original values are preserved on the session
 * (first correction) and every change is written to the audit log with previous/new values and a
 * reason (DS2 §2.9.4, scenario 18).
 */
@Injectable()
export class SessionCorrectionService {
  constructor(private readonly audit: AuditService) {}

  async apply(
    tx: Tx,
    args: {
      actorId: string;
      userId: string;
      session: AttendanceSession | null;
      change: SessionChange;
      reason: string;
      action: 'SESSION_CORRECTED' | 'CORRECTION_APPROVED';
      correctionId?: string;
    },
  ): Promise<AttendanceSession> {
    const { session, change } = args;

    if (!session) {
      if (!change.checkInAt) {
        throw Errors.badRequest(ErrorCode.INVALID_TIME_RANGE, 'A check-in time is required to create a missing session');
      }
      assertOrder(change.checkInAt, change.checkOutAt ?? null);
      const created = await tx.attendanceSession.create({
        data: {
          userId: args.userId,
          checkInAt: change.checkInAt,
          checkInMethod: 'ADMIN_CORRECTED',
          checkOutAt: change.checkOutAt ?? null,
          checkOutMethod: change.checkOutAt ? 'ADMIN_CORRECTED' : null,
          status: change.checkOutAt ? 'COMPLETED' : 'OPEN',
          corrected: true,
        },
      });
      await this.audit.record(
        {
          actorId: args.actorId,
          action: args.action,
          entityType: 'AttendanceSession',
          entityId: created.id,
          previousValues: null,
          newValues: { ...toSessionDto(created), correctionId: args.correctionId ?? null },
          reason: args.reason,
        },
        tx,
      );
      return created;
    }

    const checkInAt = change.checkInAt ?? session.checkInAt;
    const checkOutAt = change.checkOutAt === undefined ? session.checkOutAt : change.checkOutAt;
    assertOrder(checkInAt, checkOutAt);

    const checkInChanged = change.checkInAt !== undefined && change.checkInAt.getTime() !== session.checkInAt.getTime();
    const checkOutChanged =
      change.checkOutAt !== undefined && (change.checkOutAt?.getTime() ?? null) !== (session.checkOutAt?.getTime() ?? null);

    const updated = await tx.attendanceSession.update({
      where: { id: session.id },
      data: {
        checkInAt,
        checkInMethod: checkInChanged ? 'ADMIN_CORRECTED' : session.checkInMethod,
        checkOutAt,
        checkOutMethod: checkOutAt == null ? null : checkOutChanged ? 'ADMIN_CORRECTED' : session.checkOutMethod,
        status: checkOutAt ? 'COMPLETED' : 'OPEN',
        corrected: true,
        ...(session.corrected ? {} : { originalCheckInAt: session.checkInAt, originalCheckOutAt: session.checkOutAt }),
      },
    });
    await this.audit.record(
      {
        actorId: args.actorId,
        action: args.action,
        entityType: 'AttendanceSession',
        entityId: session.id,
        previousValues: toSessionDto(session),
        newValues: { ...toSessionDto(updated), correctionId: args.correctionId ?? null },
        reason: args.reason,
      },
      tx,
    );
    return updated;
  }
}

function assertOrder(checkIn: Date, checkOut: Date | null) {
  if (checkOut && checkOut < checkIn) {
    throw Errors.badRequest(ErrorCode.INVALID_TIME_RANGE, 'Check-out cannot be before check-in');
  }
}
