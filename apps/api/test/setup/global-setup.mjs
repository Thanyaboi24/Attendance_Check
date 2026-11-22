// Starts a throw-away PostgreSQL for the e2e tests and applies the real migrations.
// Uses TEST_DATABASE_URL when provided (e.g. CI service container or `docker compose up postgres`),
// otherwise downloads/starts an embedded PostgreSQL (no Docker needed).
import { execSync } from 'node:child_process';
import net from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default async function globalSetup() {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    // Ask the OS for a free port: a fixed one can fall inside a range Windows reserves for Hyper-V/WSL
    // (bind then fails with "Permission denied"), and those ranges change between restarts.
    const port = Number(process.env.TEST_PG_PORT) || (await freePort());
    const pg = new EmbeddedPostgres({
      databaseDir: mkdtempSync(path.join(tmpdir(), 'attendance-pg-')),
      user: 'postgres',
      password: 'postgres',
      port,
      persistent: false,
      // UTF-8 explicitly: on Windows initdb otherwise picks the ANSI code page (WIN1252), which cannot store Thai.
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
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

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}
