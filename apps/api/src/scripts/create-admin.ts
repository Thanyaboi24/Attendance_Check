/**
 * Creates the first System Administrator on a fresh production database (never seed production with the
 * development accounts, whose passwords are public). Prints a one-time activation link to set the password.
 *
 *   node dist/scripts/create-admin.js --email you@siit.tu.ac.th --name "Your Name" --staff-id A0001 \
 *     [--department "SIIT"] [--role SYSTEM_ADMIN|ATTENDANCE_ADMIN]
 *
 * Uses DATABASE_URL, APP_LINK_BASE and ACTIVATION_TTL_HOURS (default 24) from the environment.
 */
import { PrismaClient } from '@prisma/client';
import { randomToken, sha256 } from '../auth/crypto';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg('email')?.trim().toLowerCase();
  const fullName = arg('name')?.trim();
  const staffId = arg('staff-id')?.trim();
  const department = arg('department')?.trim() || 'SIIT';
  const role = (arg('role') ?? 'SYSTEM_ADMIN').toUpperCase();
  if (!email || !fullName || !staffId) {
    throw new Error('Usage: create-admin --email <email> --name "<full name>" --staff-id <id> [--department <d>] [--role SYSTEM_ADMIN|ATTENDANCE_ADMIN]');
  }
  if (role !== 'SYSTEM_ADMIN' && role !== 'ATTENDANCE_ADMIN') throw new Error('--role must be SYSTEM_ADMIN or ATTENDANCE_ADMIN');

  const linkBase = (process.env.APP_LINK_BASE ?? '').replace(/\/+$/, '');
  if (!linkBase) throw new Error('APP_LINK_BASE is not set');
  const ttlHours = Number(process.env.ACTIVATION_TTL_HOURS ?? 24);

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { staffId }] } });
    if (existing) throw new Error(`A user with this email or staff ID already exists (${existing.email})`);

    const token = randomToken();
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, fullName, staffId, department, role: role as 'SYSTEM_ADMIN' | 'ATTENDANCE_ADMIN', status: 'PENDING_ACTIVATION' },
      });
      await tx.actionToken.create({
        data: { userId: created.id, type: 'ACTIVATION', tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlHours * 3_600_000) },
      });
      await tx.auditLog.create({
        data: { actorId: null, actorType: 'SYSTEM', action: 'USER_CREATED', entityType: 'User', entityId: created.id, reason: 'Created with the create-admin script' },
      });
      return created;
    });

    console.log(`Created ${user.role} ${user.fullName} <${user.email}>.`);
    console.log(`Open this link within ${ttlHours} hours to set the password (single use):`);
    console.log(`${linkBase}/activate?token=${encodeURIComponent(token)}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
