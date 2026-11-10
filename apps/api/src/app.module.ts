import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin';
import { AttendanceModule } from './attendance/attendance.controller';
import { AuditModule } from './audit/audit.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard, RolesGuard } from './auth/guards';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { ClockService } from './common/clock.service';
import { ENV, loadEnv } from './config/env';
import { CorrectionsModule } from './corrections/corrections';
import { GeofenceModule } from './geofence/geofence';
import { HealthController } from './health.controller';
import { JobsModule } from './jobs/jobs.service';
import { MailModule } from './mail/mail.service';
import { PrismaModule } from './prisma/prisma.service';
import { UsersModule } from './users/users';

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }, ClockService],
  exports: [ENV, ClockService],
})
class CoreModule {}

@Module({
  imports: [
    CoreModule,
    JwtModule.registerAsync({ global: true, useFactory: () => ({ secret: loadEnv().JWT_SECRET }) }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      // Account lockout (AuthService) is still enforced in tests; only the per-IP rate limit is skipped.
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    MailModule,
    AuthModule,
    UsersModule,
    GeofenceModule,
    AttendanceModule,
    CorrectionsModule,
    AdminModule,
    JobsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: rate limit → authenticate → authorise (design §17.3).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
