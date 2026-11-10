import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, type Tx } from '../prisma/prisma.service';

export interface AuditEntry {
  /** null = system process (scheduled job). */
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  previousValues?: unknown;
  newValues?: unknown;
  reason?: string | null;
}

/** Append-only audit trail (design §17.8). Pass the transaction client so the log commits with the change. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: Tx): Promise<void> {
    const db = tx ?? this.prisma;
    await db.auditLog.create({
      data: {
        actorId: entry.actorId,
        actorType: entry.actorId ? 'USER' : 'SYSTEM',
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        previousValues: toJson(entry.previousValues),
        newValues: toJson(entry.newValues),
        reason: entry.reason ?? null,
      },
    });
  }
}

function toJson(v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (v === undefined || v === null) return Prisma.DbNull;
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
