-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STAFF', 'ATTENDANCE_ADMIN', 'SYSTEM_ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('ACTIVE', 'APPROVED', 'CANCELLED', 'UNRESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Method" AS ENUM ('MANUAL', 'AUTOMATIC', 'ADMIN_CORRECTED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('OPEN', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LocationClass" AS ENUM ('CONFIRMED_INSIDE', 'CONFIRMED_OUTSIDE', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('POSTED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationEventType" AS ENUM ('POSTED', 'FAILED', 'RESPONDED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ActionTokenType" AS ENUM ('ACTIVATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "replacedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ActionTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeofenceConfiguration" (
    "version" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "centerLat" DOUBLE PRECISION NOT NULL,
    "centerLng" DOUBLE PRECISION NOT NULL,
    "radiusM" INTEGER NOT NULL,
    "gracePeriodSec" INTEGER NOT NULL DEFAULT 300,
    "maxLocationAgeSec" INTEGER NOT NULL DEFAULT 60,
    "maxAccuracyM" INTEGER NOT NULL DEFAULT 30,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "createdById" TEXT,

    CONSTRAINT "GeofenceConfiguration_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "AttendanceSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkInAt" TIMESTAMPTZ(3) NOT NULL,
    "checkInMethod" "Method" NOT NULL,
    "checkOutAt" TIMESTAMPTZ(3),
    "checkOutMethod" "Method",
    "status" "SessionStatus" NOT NULL DEFAULT 'OPEN',
    "corrected" BOOLEAN NOT NULL DEFAULT false,
    "originalCheckInAt" TIMESTAMPTZ(3),
    "originalCheckOutAt" TIMESTAMPTZ(3),
    "flaggedLongOpenAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRequest" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" "RequestType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'ACTIVE',
    "method" "Method",
    "configVersion" INTEGER NOT NULL,
    "geofenceDetectedAt" TIMESTAMPTZ(3) NOT NULL,
    "notificationStatus" "NotificationStatus",
    "notificationPostedAt" TIMESTAMPTZ(3),
    "deadlineAt" TIMESTAMPTZ(3) NOT NULL,
    "userConfirmedAt" TIMESTAMPTZ(3),
    "clientRecordedAt" TIMESTAMPTZ(3),
    "approvedAt" TIMESTAMPTZ(3),
    "resolvedAt" TIMESTAMPTZ(3),
    "resolutionReason" TEXT,
    "locationAttempts" INTEGER,
    "deviceModel" TEXT,
    "deviceOs" TEXT,
    "appVersion" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AttendanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationEvidence" (
    "id" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "measuredAt" TIMESTAMPTZ(3) NOT NULL,
    "accuracyM" DOUBLE PRECISION,
    "isMock" BOOLEAN NOT NULL DEFAULT false,
    "distanceM" DOUBLE PRECISION,
    "classification" "LocationClass" NOT NULL,
    "clientDistanceM" DOUBLE PRECISION,
    "clientClassification" "LocationClass",
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrectionRequest" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "workDate" TEXT NOT NULL,
    "requestedCheckInAt" TIMESTAMPTZ(3),
    "requestedCheckOutAt" TIMESTAMPTZ(3),
    "reason" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorrectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationEvent" (
    "id" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationEventType" NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "action" TEXT,
    "detail" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" "ActorType" NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "previousValues" JSONB,
    "newValues" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_staffId_key" ON "User"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionToken_tokenHash_key" ON "ActionToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ActionToken_userId_type_idx" ON "ActionToken"("userId", "type");

-- CreateIndex
CREATE INDEX "AttendanceSession_userId_checkInAt_idx" ON "AttendanceSession"("userId", "checkInAt");

-- CreateIndex
CREATE INDEX "AttendanceSession_status_idx" ON "AttendanceSession"("status");

-- CreateIndex
CREATE INDEX "AttendanceRequest_userId_status_idx" ON "AttendanceRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "AttendanceRequest_status_deadlineAt_idx" ON "AttendanceRequest"("status", "deadlineAt");

-- CreateIndex
CREATE INDEX "AttendanceRequest_createdAt_idx" ON "AttendanceRequest"("createdAt");

-- CreateIndex
CREATE INDEX "LocationEvidence_requestId_idx" ON "LocationEvidence"("requestId");

-- CreateIndex
CREATE INDEX "LocationEvidence_receivedAt_idx" ON "LocationEvidence"("receivedAt");

-- CreateIndex
CREATE INDEX "CorrectionRequest_userId_createdAt_idx" ON "CorrectionRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CorrectionRequest_status_idx" ON "CorrectionRequest"("status");

-- CreateIndex
CREATE INDEX "NotificationEvent_requestId_idx" ON "NotificationEvent"("requestId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionToken" ADD CONSTRAINT "ActionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeofenceConfiguration" ADD CONSTRAINT "GeofenceConfiguration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_configVersion_fkey" FOREIGN KEY ("configVersion") REFERENCES "GeofenceConfiguration"("version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationEvidence" ADD CONSTRAINT "LocationEvidence_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AttendanceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AttendanceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

