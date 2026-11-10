import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Run a state transition in one transaction (DS2 §2.9.3 rule 6). READ COMMITTED + explicit
   * `SELECT … FOR UPDATE` row locks serialise concurrent manual/auto submissions per user.
   */
  tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(fn, { timeout: 15_000, maxWait: 10_000 });
  }
}

/** Lock a user's row so all attendance writes for that user are serialised. */
export async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
