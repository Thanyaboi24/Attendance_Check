import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { Env } from './config/env';

/** Shared HTTP setup for main.ts and the e2e tests. */
export function configureApp(app: INestApplication, env: Env): void {
  const express = app as NestExpressApplication;
  express.setGlobalPrefix('api/v1');
  express.use(helmet());
  express.enableCors({
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    exposedHeaders: ['Content-Disposition'],
  });
  if (env.TRUST_PROXY) express.set('trust proxy', 1);
  express.useBodyParser('json', { limit: '100kb' });

  const swagger = env.ENABLE_SWAGGER ?? env.NODE_ENV !== 'production';
  if (swagger) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Faculty Attendance API')
        .setDescription('Contract: docs/API.md. Schemas: packages/shared (zod).')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/v1/docs', app, doc);
  }
}
