import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { ENV, type Env } from '../config/env';

export interface SentMail {
  to: string;
  subject: string;
  text: string;
}

/** Activation and password-reset emails via the institution's SMTP (Mailpit in development). */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null;
  /** Last messages, kept for tests and local debugging when SMTP is not configured. */
  readonly outbox: SentMail[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {
    this.transport = env.SMTP_HOST
      ? nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        })
      : null;
  }

  async send(mail: SentMail): Promise<void> {
    this.outbox.push(mail);
    if (this.outbox.length > 50) this.outbox.shift();
    if (!this.transport) {
      if (this.env.NODE_ENV !== 'production') this.logger.log(`[mail disabled] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
      return;
    }
    try {
      await this.transport.sendMail({ from: this.env.MAIL_FROM, ...mail });
    } catch (e) {
      // Do not fail the API call (e.g. forgot-password must not reveal anything); log for operators.
      this.logger.error(`Failed to send mail "${mail.subject}": ${(e as Error).message}`);
    }
  }

  activationMail(to: string, fullName: string, token: string, ttlHours: number): SentMail {
    const link = `${this.env.APP_LINK_BASE}/activate?token=${encodeURIComponent(token)}`;
    return {
      to,
      subject: 'Activate your Faculty Attendance account',
      text:
        `Dear ${fullName},\n\nAn attendance account has been created for you. ` +
        `Set your password using the link below (valid for ${ttlHours} hours, single use):\n\n${link}\n\n` +
        `On your Android phone you can also open: facultyattendance://activate?token=${encodeURIComponent(token)}\n`,
    };
  }

  resetMail(to: string, fullName: string, token: string, ttlMin: number): SentMail {
    const link = `${this.env.APP_LINK_BASE}/reset-password?token=${encodeURIComponent(token)}`;
    return {
      to,
      subject: 'Reset your Faculty Attendance password',
      text:
        `Dear ${fullName},\n\nUse the link below to set a new password (valid for ${ttlMin} minutes, single use):\n\n${link}\n\n` +
        `On your Android phone you can also open: facultyattendance://reset-password?token=${encodeURIComponent(token)}\n\n` +
        `If you did not ask for this, you can ignore this email.\n`,
    };
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
