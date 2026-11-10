import { Inject, Injectable, Logger, Module } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { bangkokDayBounds, DISPLAY_TIME_ZONE, STALE_REQUEST_AFTER_DEADLINE_SEC, toBangkokDate } from '@attendance/shared';
import { AuditService } from '../audit/audit.service';
import { ClockService } from '../common/clock.service';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Scheduled jobs (design §17.7). The backend cannot read the phone's location (DS2 §2.8.5), so it
 * never performs automatic attendance itself: it can only mark requests for review.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private get enabled() {
    return this.env.ENABLE_JOBS;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledExpire() {
    if (this.enabled) await this.expireStaleRequests();
  }

  @Cron('59 23 * * *', { timeZone: DISPLAY_TIME_ZONE })
  async scheduledFlag() {
    if (this.enabled) await this.flagLongOpenSessions();
  }

  @Cron('30 2 * * *', { timeZone: DISPLAY_TIME_ZONE })
  async scheduledDaily() {
    if (!this.enabled) return;
    await this.purgeLocationEvidence();
    await this.cleanupTokens();
  }

  /** ACTIVE requests long past their deadline (the phone never reported back) → UNRESOLVED for review. */
  async expireStaleRequests(): Promise<number> {
    const now = this.clock.now();
    const cutoff = new Date(now.getTime() - STALE_REQUEST_AFTER_DEADLINE_SEC * 1000);
    const stale = await this.prisma.attendanceRequest.findMany({
      where: { status: 'ACTIVE', deadlineAt: { lt: cutoff } },
      select: { id: true },
    });
    for (const { id } of stale) {
      await this.prisma.tx(async (tx) => {
        const res = await tx.attendanceRequest.updateMany({
          where: { id, status: 'ACTIVE' },
          data: { status: 'UNRESOLVED', resolutionReason: 'NO_CLIENT_RESPONSE', resolvedAt: now },
        });
        if (res.count) {
          await this.audit.record(
            { actorId: null, action: 'REQUEST_EXPIRED', entityType: 'AttendanceRequest', entityId: id, reason: 'No result from the phone after the grace period' },
            tx,
          );
        }
      });
    }
    if (stale.length) this.logger.log(`Marked ${stale.length} stale request(s) UNRESOLVED`);
    return stale.length;
  }

  /** Sessions still open from a previous Bangkok day appear in the admin open-session review. */
  async flagLongOpenSessions(): Promise<number> {
    const now = this.clock.now();
    const { start } = bangkokDayBounds(toBangkokDate(now));
    const res = await this.prisma.attendanceSession.updateMany({
      where: { status: 'OPEN', checkInAt: { lt: start }, flaggedLongOpenAt: null },
      data: { flaggedLongOpenAt: now },
    });
    return res.count;
  }

  /** Delete location evidence older than the retention period agreed with the institution. */
  async purgeLocationEvidence(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - this.env.EVIDENCE_RETENTION_DAYS * 86_400_000);
    const res = await this.prisma.locationEvidence.deleteMany({ where: { receivedAt: { lt: cutoff } } });
    if (res.count) {
      await this.audit.record({
        actorId: null,
        action: 'EVIDENCE_PURGED',
        entityType: 'LocationEvidence',
        entityId: '*',
        newValues: { deleted: res.count, olderThan: cutoff.toISOString() },
      });
    }
    return res.count;
  }

  async cleanupTokens(): Promise<number> {
    const now = this.clock.now();
    const a = await this.prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } }] },
    });
    const b = await this.prisma.actionToken.deleteMany({ where: { expiresAt: { lt: now } } });
    return a.count + b.count;
  }
}

@Module({ providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
