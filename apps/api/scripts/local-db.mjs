// Development PostgreSQL without Docker: `pnpm --filter api db:local`.
// Data persists in apps/api/.local-pg. Stop with Ctrl+C.
// Then set DATABASE_URL=postgresql://postgres:postgres@localhost:5433/attendance?schema=public
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.local-pg');
const port = Number(process.env.LOCAL_PG_PORT ?? 5433);
const fresh = !existsSync(dir);

const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port, persistent: true });
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase('attendance');
console.log(`PostgreSQL running on port ${port}`);
console.log(`DATABASE_URL=postgresql://postgres:postgres@localhost:${port}/attendance?schema=public`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
