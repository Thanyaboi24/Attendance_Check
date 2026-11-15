-- Staff self-registration from the mobile app, approved by an administrator.
ALTER TYPE "AccountStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "AccountStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TABLE "User" ADD COLUMN "selfRegistered" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "reviewedAt" TIMESTAMPTZ(3);
ALTER TABLE "User" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "User" ADD COLUMN "reviewNote" TEXT;

ALTER TABLE "User" ADD CONSTRAINT "User_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
