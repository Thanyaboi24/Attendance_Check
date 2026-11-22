#!/usr/bin/env node
/**
 * Builds the production installation package for https://siitatt.bsoftsolutions.net:
 *
 *   node deploy/make-package.mjs
 *   → release/siitatt-server-<version>/  (+ .zip and .tar.gz)
 *
 * The package is self-contained: the server needs only Docker (see deploy/server/INSTALL.md).
 * It contains the prebuilt API (dist + Prisma migrations + a pinned npm lockfile) and the
 * prebuilt admin website. Never includes .env files, seeds or development accounts.
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tpl = join(root, 'deploy', 'server');
const run = (cmd, opts = {}) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
};

const apiPkg = JSON.parse(readFileSync(join(root, 'apps/api/package.json'), 'utf8'));
const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
const version = `${apiPkg.version}-${stamp}`;
const name = `siitatt-server-${version}`;
const releaseDir = join(root, 'release');
const out = join(releaseDir, name);

// 1. Build. The admin website calls the API on its own origin (/api/v1); no Maps key is embedded
//    unless PROD_GOOGLE_MAPS_API_KEY is given (restrict it to https://siitatt.bsoftsolutions.net/*).
if (!process.argv.includes('--skip-build')) {
  run('pnpm --filter @attendance/shared build');
  run('pnpm --filter api build');
  run('pnpm --filter admin-web build', {
    env: { ...process.env, VITE_API_URL: '', VITE_GOOGLE_MAPS_API_KEY: process.env.PROD_GOOGLE_MAPS_API_KEY ?? '' },
  });
}

// 2. Assemble.
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ['docker-compose.yml', '.env.example', 'install.sh', 'create-admin.sh', 'backup.sh', 'INSTALL.md']) {
  copyFileSync(join(tpl, f), join(out, f));
}
writeFileSync(join(out, 'VERSION'), `${version}\n`);
cpSync(join(root, 'deploy/nginx'), join(out, 'nginx'), { recursive: true });

// web/: Caddy + admin website
cpSync(join(tpl, 'web'), join(out, 'web'), { recursive: true });
cpSync(join(root, 'apps/admin-web/dist'), join(out, 'web/dist'), { recursive: true });
const html = readFileSync(join(out, 'web/dist/index.html'), 'utf8');
if (!html.includes('/assets/')) throw new Error('admin-web/dist/index.html looks wrong');

// api/: compiled JS (no source maps), schema + migrations (no seed), shared package as a tarball
const api = join(out, 'api');
mkdirSync(api, { recursive: true });
copyFileSync(join(tpl, 'api/Dockerfile'), join(api, 'Dockerfile'));
copyFileSync(join(tpl, 'api/package.json'), join(api, 'package.json'));
if (existsSync(join(tpl, 'api/package-lock.json'))) copyFileSync(join(tpl, 'api/package-lock.json'), join(api, 'package-lock.json'));
cpSync(join(root, 'apps/api/dist'), join(api, 'dist'), { recursive: true, filter: (src) => !src.endsWith('.map') });
mkdirSync(join(api, 'prisma'), { recursive: true });
copyFileSync(join(root, 'apps/api/prisma/schema.prisma'), join(api, 'prisma/schema.prisma'));
cpSync(join(root, 'apps/api/prisma/migrations'), join(api, 'prisma/migrations'), { recursive: true });

const sharedSrc = JSON.parse(readFileSync(join(root, 'packages/shared/package.json'), 'utf8'));
const sharedStage = join(out, '.shared-stage');
mkdirSync(sharedStage, { recursive: true });
cpSync(join(root, 'packages/shared/dist'), join(sharedStage, 'dist'), { recursive: true });
writeFileSync(
  join(sharedStage, 'package.json'),
  JSON.stringify(
    {
      name: sharedSrc.name,
      version: sharedSrc.version,
      private: true,
      main: './dist/index.js',
      types: './dist/index.d.ts',
      exports: { '.': { types: './dist/index.d.ts', import: './dist/index.mjs', require: './dist/index.js' } },
      dependencies: sharedSrc.dependencies,
    },
    null,
    2,
  ),
);
mkdirSync(join(api, 'vendor'), { recursive: true });
run(`npm pack --pack-destination "${join(api, 'vendor')}"`, { cwd: sharedStage });
rmSync(sharedStage, { recursive: true, force: true });
const tgz = readdirSync(join(api, 'vendor')).find((f) => f.endsWith('.tgz'));
if (tgz !== 'attendance-shared-1.0.0.tgz') throw new Error(`Unexpected shared tarball ${tgz}; update deploy/server/api/package.json`);

// Pinned lockfile (kept in deploy/server/api so every package resolves the same dependency tree).
run('npm install --package-lock-only --no-audit --no-fund', { cwd: api });
copyFileSync(join(api, 'package-lock.json'), join(tpl, 'api/package-lock.json'));

// 3. Safety checks: nothing secret or development-only in the package.
const all = [];
const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(join(d, e.name)) : all.push(join(d, e.name))));
walk(out);
const bad = all.filter((f) => /[\\/]\.env$|seed\.|\.env\.local|node_modules/.test(f));
if (bad.length) throw new Error(`Refusing to package: ${bad.join(', ')}`);
const mapsKey = /AIza[0-9A-Za-z_-]{35}/;
if (!process.env.PROD_GOOGLE_MAPS_API_KEY && all.some((f) => f.endsWith('.js') && mapsKey.test(readFileSync(f, 'utf8')))) {
  throw new Error('A Google Maps key ended up in the build; rebuild without VITE_GOOGLE_MAPS_API_KEY');
}

// 4. Archives (Windows ships bsdtar as tar.exe, which also writes zip).
const tar = process.platform === 'win32' ? `"${process.env.SystemRoot}\\System32\\tar.exe"` : 'tar';
for (const ext of ['zip', 'tar.gz']) rmSync(join(releaseDir, `${name}.${ext}`), { force: true });
run(`${tar} -czf "${name}.tar.gz" "${name}"`, { cwd: releaseDir });
if (process.platform === 'win32') run(`${tar} -a -cf "${name}.zip" "${name}"`, { cwd: releaseDir });
console.log(`\nPackage ready (${all.length} files):\n  ${out}\n  ${out}.zip\n  ${out}.tar.gz`);
