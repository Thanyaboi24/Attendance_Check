import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  LogoutRequestSchema,
  RefreshRequestSchema,
  SetPasswordWithTokenSchema,
  type ForgotPasswordRequest,
  type LoginRequest,
  type LogoutRequest,
  type RefreshRequest,
  type SetPasswordWithToken,
  type UserProfile,
} from '@attendance/shared';
import { CurrentUser, Public, type AuthUser } from '../common/decorators';
import { zodPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, toProfile } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body(zodPipe(LoginRequestSchema)) dto: LoginRequest) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(zodPipe(RefreshRequestSchema)) dto: RefreshRequest) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Body(zodPipe(LogoutRequestSchema)) dto: LogoutRequest) {
    await this.auth.logout(dto.refreshToken);
    return { ok: true as const };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password/forgot')
  @HttpCode(200)
  async forgot(@Body(zodPipe(ForgotPasswordRequestSchema)) dto: ForgotPasswordRequest) {
    await this.auth.forgotPassword(dto.email);
    return { ok: true as const };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password/reset')
  @HttpCode(200)
  async reset(@Body(zodPipe(SetPasswordWithTokenSchema)) dto: SetPasswordWithToken) {
    await this.auth.resetPassword(dto);
    return { ok: true as const };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('activate')
  @HttpCode(200)
  async activate(@Body(zodPipe(SetPasswordWithTokenSchema)) dto: SetPasswordWithToken) {
    await this.auth.activate(dto);
    return { ok: true as const };
  }
}

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async me(@CurrentUser() user: AuthUser): Promise<UserProfile> {
    return toProfile(await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } }));
  }
}
