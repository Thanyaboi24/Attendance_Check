import { Body, Controller, Get, Injectable, Module, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { GeofenceConfiguration } from '@prisma/client';
import {
  Role,
  UpdateGeofenceConfigSchema,
  type GeofenceConfig,
  type UpdateGeofenceConfig,
} from '@attendance/shared';
import { AuditService } from '../audit/audit.service';
import { Errors } from '../common/app-exception';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { zodPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

export function toConfigDto(c: GeofenceConfiguration): GeofenceConfig {
  return {
    version: c.version,
    name: c.name,
    centerLat: c.centerLat,
    centerLng: c.centerLng,
    radiusM: c.radiusM,
    gracePeriodSec: c.gracePeriodSec,
    maxLocationAgeSec: c.maxLocationAgeSec,
    maxAccuracyM: c.maxAccuracyM,
    effectiveAt: c.effectiveAt.toISOString(),
  };
}

@Injectable()
export class GeofenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The active configuration is the newest version. */
  async active(): Promise<GeofenceConfiguration> {
    const cfg = await this.prisma.geofenceConfiguration.findFirst({ orderBy: { version: 'desc' } });
    if (!cfg) throw Errors.notFound('Geofence configuration');
    return cfg;
  }

  async byVersion(version: number): Promise<GeofenceConfiguration> {
    const cfg = await this.prisma.geofenceConfiguration.findUnique({ where: { version } });
    if (!cfg) throw Errors.notFound('Geofence configuration version');
    return cfg;
  }

  history(): Promise<GeofenceConfiguration[]> {
    return this.prisma.geofenceConfiguration.findMany({ orderBy: { version: 'desc' } });
  }

  /** Changes never edit a version in place: a new version is created (DS2 §2.9.5). */
  async update(actorId: string, dto: UpdateGeofenceConfig): Promise<GeofenceConfiguration> {
    return this.prisma.tx(async (tx) => {
      const previous = await tx.geofenceConfiguration.findFirst({ orderBy: { version: 'desc' } });
      const { reason, ...values } = dto;
      const created = await tx.geofenceConfiguration.create({ data: { ...values, reason, createdById: actorId } });
      await this.audit.record(
        {
          actorId,
          action: 'GEOFENCE_CONFIG_CHANGED',
          entityType: 'GeofenceConfiguration',
          entityId: String(created.version),
          previousValues: previous ? toConfigDto(previous) : null,
          newValues: toConfigDto(created),
          reason,
        },
        tx,
      );
      return created;
    });
  }
}

@ApiTags('geofence')
@ApiBearerAuth()
@Controller('geofence/config')
export class GeofenceController {
  constructor(private readonly geofence: GeofenceService) {}

  @Get('active')
  async active(): Promise<GeofenceConfig> {
    return toConfigDto(await this.geofence.active());
  }

  @Get(':version')
  async byVersion(@Param('version', ParseIntPipe) version: number): Promise<GeofenceConfig> {
    return toConfigDto(await this.geofence.byVersion(version));
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/geofence')
export class AdminGeofenceController {
  constructor(private readonly geofence: GeofenceService) {}

  @Get('configs')
  @Roles(Role.ATTENDANCE_ADMIN, Role.SYSTEM_ADMIN)
  async history(): Promise<GeofenceConfig[]> {
    return (await this.geofence.history()).map(toConfigDto);
  }

  @Put('config')
  @Roles(Role.SYSTEM_ADMIN)
  async update(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(UpdateGeofenceConfigSchema)) dto: UpdateGeofenceConfig,
  ): Promise<GeofenceConfig> {
    return toConfigDto(await this.geofence.update(user.id, dto));
  }
}

@Module({
  controllers: [GeofenceController, AdminGeofenceController],
  providers: [GeofenceService],
  exports: [GeofenceService],
})
export class GeofenceModule {}
