/**
 * Development seed: geofence v1 (SIIT Rangsit, 150 m) and one account per role.
 * Idempotent: re-running does not duplicate rows. Never run against production.
 */
import { PrismaClient, type Role } from '@prisma/client';
import argon2 from 'argon2';
import { DEFAULT_GEOFENCE } from '@attendance/shared';

const prisma = new PrismaClient();

const users: { staffId: string; email: string; fullName: string; department: string; role: Role; password: string }[] = [
  { staffId: 'S0001', email: 'staff@siit.tu.ac.th', fullName: 'Somchai Jaidee', department: 'School of ICT', role: 'STAFF', password: 'Staff1234' },
  { staffId: 'S0002', email: 'staff2@siit.tu.ac.th', fullName: 'Suda Rakdee', department: 'School of Management Technology', role: 'STAFF', password: 'Staff1234' },
  { staffId: 'A0001', email: 'attendance.admin@siit.tu.ac.th', fullName: 'Attendance Administrator', department: 'Human Resources', role: 'ATTENDANCE_ADMIN', password: 'Admin1234' },
  { staffId: 'A0002', email: 'system.admin@siit.tu.ac.th', fullName: 'System Administrator', department: 'IT Services', role: 'SYSTEM_ADMIN', password: 'Admin1234' },
];

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed a production database');

  for (const u of users) {
    const { password, ...data } = u;
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...data, status: 'ACTIVE', passwordHash: await argon2.hash(password, { type: argon2.argon2id }) },
    });
  }

  if ((await prisma.geofenceConfiguration.count()) === 0) {
    const sysAdmin = await prisma.user.findUniqueOrThrow({ where: { email: 'system.admin@siit.tu.ac.th' } });
    await prisma.geofenceConfiguration.create({
      data: {
        name: 'SIIT Rangsit campus',
        centerLat: 14.0693,
        centerLng: 100.6035,
        ...DEFAULT_GEOFENCE,
        reason: 'Initial configuration (slide: 150 m radius)',
        createdById: sysAdmin.id,
      },
    });
  }
  console.log('Seed complete:', users.map((u) => `${u.email} (${u.role})`).join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
