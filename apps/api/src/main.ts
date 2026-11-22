import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { loadEnv } from './config/env';

async function main() {
  // Local development reads apps/api/.env; variables already set in the environment win.
  if (existsSync('.env')) process.loadEnvFile('.env');
  const env = loadEnv();
  // JSON logs in production; request bodies (coordinates, passwords) are never logged.
  const logger = new ConsoleLogger({ json: env.NODE_ENV === 'production', prefix: 'attendance-api' });
  const app = await NestFactory.create(AppModule, { logger, bodyParser: false });
  configureApp(app, env);
  app.enableShutdownHooks();
  await app.listen(env.PORT);
  logger.log(`API listening on http://localhost:${env.PORT}/api/v1`);
}

void main();
