import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import {
  AccountStatus,
  ErrorCode,
  type LoginResponse,
  type SetPasswordWithToken,
  type TokenPair,
  type UserProfile,
} from '@attendance/shared';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import { ENV, type Env } from '../config/env';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, randomToken, sha256, verifyPassword } from './crypto';

export interface AccessTokenPayload {
  sub: string;
  role: User['role'];
}

const INVALID_CREDENTIALS = 'Invalid email or password';

export function toProfile(u: User): UserProfile {
  return {
    id: u.id,
    staffId: u.staffId,
    email: u.email,
    fullName: u.fullName,
    department: u.department,
    role: u.role,
    status: u.status,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly clock: ClockService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async login(email: string, password: string): Promise<LoginResponse> {
    const now = this.clock.now();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user?.lockedUntil && user.lockedUntil > now) {
      throw new AppException(
        HttpStatus.LOCKED,
        ErrorCode.ACCOUNT_LOCKED,
        'Too many failed attempts. Please try again later.',
        { retryAfterSec: Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000) },
      );
    }

    const ok = await verifyPassword(user?.passwordHash ?? null, password);
    if (!user || !ok) {
      if (user) await this.registerFailure(user, now);
      // Generic message: never reveal whether the email exists (design §7.9).
      throw new AppException(HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_CREDENTIALS, INVALID_CREDENTIALS);
    }
    if (user.status !== AccountStatus.ACTIVE) {
      throw new AppException(HttpStatus.FORBIDDEN, ErrorCode.ACCOUNT_INACTIVE, 'This account is not active. Contact the system administrator.');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
    return { tokens: await this.issueTokens(updated), user: toProfile(updated) };
  }

  private async registerFailure(user: User, now: Date) {
    const count = user.failedLoginCount + 1;
    const lock = count >= this.env.LOGIN_MAX_FAILURES;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: lock ? 0 : count,
        lockedUntil: lock ? new Date(now.getTime() + this.env.LOGIN_LOCK_MIN * 60_000) : user.lockedUntil,
      },
    });
    if (lock) {
      await this.audit.record({
        actorId: null,
        action: 'ACCOUNT_TEMPORARILY_LOCKED',
        entityType: 'User',
        entityId: user.id,
        reason: `${this.env.LOGIN_MAX_FAILURES} failed login attempts`,
      });
    }
  }

  async issueTokens(user: Pick<User, 'id' | 'role'>): Promise<TokenPair> {
    const now = this.clock.now();
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: this.env.JWT_ACCESS_TTL_SEC });
    const refreshToken = randomToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(now.getTime() + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      },
    });
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date(now.getTime() + this.env.JWT_ACCESS_TTL_SEC * 1000).toISOString(),
    };
  }

  /** Rotating refresh tokens; re-use of a revoked token revokes the whole family for that user. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const now = this.clock.now();
    const invalid = () => new AppException(HttpStatus.UNAUTHORIZED, ErrorCode.TOKEN_INVALID, 'Session expired. Please log in again.');
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!stored) throw invalid();
    if (stored.revokedAt) {
      await this.revokeAll(stored.userId, now);
      throw invalid();
    }
    if (stored.expiresAt <= now) throw invalid();
    if (stored.user.status !== AccountStatus.ACTIVE) {
      await this.revokeAll(stored.userId, now);
      throw new AppException(HttpStatus.FORBIDDEN, ErrorCode.ACCOUNT_INACTIVE, 'This account is not active.');
    }

    // Single-use: only the caller that flips revokedAt wins (concurrent refreshes cannot both succeed).
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (revoked.count === 0) throw invalid();
    const tokens = await this.issueTokens(stored.user);
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { replacedBy: sha256(tokens.refreshToken) } });
    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
  }

  async revokeAll(userId: string, now = this.clock.now()) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
  }

  // ---- Activation / password reset (single-use, time-limited links) -------------------------

  async createActionToken(userId: string, type: 'ACTIVATION' | 'PASSWORD_RESET'): Promise<string> {
    const now = this.clock.now();
    const ttlMs =
      type === 'ACTIVATION' ? this.env.ACTIVATION_TTL_HOURS * 3_600_000 : this.env.PASSWORD_RESET_TTL_MIN * 60_000;
    // Older unused links of the same type stop working.
    await this.prisma.actionToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: now } });
    const token = randomToken();
    await this.prisma.actionToken.create({
      data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(now.getTime() + ttlMs) },
    });
    return token;
  }

  async sendActivation(user: User): Promise<void> {
    const token = await this.createActionToken(user.id, 'ACTIVATION');
    await this.mail.send(this.mail.activationMail(user.email, user.fullName, token, this.env.ACTIVATION_TTL_HOURS));
  }

  /** Always succeeds from the caller's point of view (no account enumeration). */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== AccountStatus.ACTIVE) return;
    const token = await this.createActionToken(user.id, 'PASSWORD_RESET');
    await this.mail.send(this.mail.resetMail(user.email, user.fullName, token, this.env.PASSWORD_RESET_TTL_MIN));
  }

  async activate(dto: SetPasswordWithToken): Promise<void> {
    await this.consumeToken(dto, 'ACTIVATION');
  }

  async resetPassword(dto: SetPasswordWithToken): Promise<void> {
    await this.consumeToken(dto, 'PASSWORD_RESET');
  }

  private async consumeToken(dto: SetPasswordWithToken, type: 'ACTIVATION' | 'PASSWORD_RESET') {
    const now = this.clock.now();
    const invalid = () =>
      new AppException(HttpStatus.BAD_REQUEST, ErrorCode.TOKEN_INVALID, 'This link is invalid or has expired. Please request a new one.');
    const passwordHash = await hashPassword(dto.password);

    await this.prisma.tx(async (tx) => {
      const token = await tx.actionToken.findUnique({ where: { tokenHash: sha256(dto.token) }, include: { user: true } });
      if (!token || token.type !== type || token.usedAt || token.expiresAt <= now) throw invalid();
      if (token.user.status === AccountStatus.DEACTIVATED) throw invalid();
      const used = await tx.actionToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: now } });
      if (used.count === 0) throw invalid();

      await tx.user.update({
        where: { id: token.userId },
        data: {
          passwordHash,
          failedLoginCount: 0,
          lockedUntil: null,
          ...(type === 'ACTIVATION' ? { status: AccountStatus.ACTIVE } : {}),
        },
      });
      // A password change signs the user out everywhere.
      await tx.refreshToken.updateMany({ where: { userId: token.userId, revokedAt: null }, data: { revokedAt: now } });
      await this.audit.record(
        {
          actorId: token.userId,
          action: type === 'ACTIVATION' ? 'ACCOUNT_ACTIVATED' : 'PASSWORD_RESET',
          entityType: 'User',
          entityId: token.userId,
        },
        tx,
      );
    });
  }
}
