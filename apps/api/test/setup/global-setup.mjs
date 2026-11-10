// Starts a throw-away PostgreSQL for the e2e tests and applies the real migrations.
// Uses TEST_DATABASE_URL when provided (e.g. CI service container or `docker compose up postgres`),
// otherwise downloads/starts an embedded PostgreSQL (no Docker needed).
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default async function globalSetup() {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const port = 54329;
    const pg = new EmbeddedPostgres({
      databaseDir: mkdtempSync(path.join(tmpdir(), 'attendance-pg-')),
      user: 'postgres',
      password: 'postgres',
      port,
      persistent: false,
      onLog: () => {},
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('attendance_test');
    globalThis.__EMBEDDED_PG__ = pg;
    url = `postgresql://postgres:postgres@localhost:${port}/attendance_test?schema=public`;
  }
  process.env.DATABASE_URL = url;
  execSync('npx prisma migrate deploy', { cwd: apiRoot, env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
}
