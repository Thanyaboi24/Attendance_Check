import type { AttendanceRequest, AttendanceSession, LocationEvidence, User } from '@prisma/client';
import type {
  AttendanceActionResult,
  AttendanceRequestDto,
  EvidenceDto,
  SessionDto,
  UserRef,
} from '@attendance/shared';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toSessionDto(s: AttendanceSession): SessionDto {
  return {
    id: s.id,
    checkInAt: s.checkInAt.toISOString(),
    checkInMethod: s.checkInMethod,
    checkOutAt: iso(s.checkOutAt),
    checkOutMethod: s.checkOutMethod,
    status: s.status,
    corrected: s.corrected,
  };
}

export function toRequestDto(r: AttendanceRequest): AttendanceRequestDto {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    method: r.method,
    sessionId: r.sessionId,
    configVersion: r.configVersion,
    geofenceDetectedAt: r.geofenceDetectedAt.toISOString(),
    notificationStatus: r.notificationStatus,
    notificationPostedAt: iso(r.notificationPostedAt),
    deadlineAt: r.deadlineAt.toISOString(),
    approvedAt: iso(r.approvedAt),
    resolutionReason: r.resolutionReason,
    createdAt: r.createdAt.toISOString(),
  };
}

export function toUserRef(u: Pick<User, 'id' | 'staffId' | 'fullName' | 'department'>): UserRef {
  return { id: u.id, staffId: u.staffId, fullName: u.fullName, department: u.department };
}

export function toEvidenceDto(e: LocationEvidence): EvidenceDto {
  return {
    id: e.id,
    stage: e.stage,
    lat: e.lat,
    lng: e.lng,
    measuredAt: e.measuredAt.toISOString(),
    accuracyM: e.accuracyM,
    isMock: e.isMock,
    distanceM: e.distanceM,
    classification: e.classification,
    clientClassification: e.clientClassification,
    receivedAt: e.receivedAt.toISOString(),
  };
}

/** The stored outcome of a request. Returned again for repeated submissions (idempotency). */
export function toActionResult(r: AttendanceRequest, lastEvidence: LocationEvidence | null): AttendanceActionResult {
  return {
    requestId: r.id,
    status: r.status,
    sessionId: r.sessionId,
    method: r.method,
    officialTime: iso(r.approvedAt),
    classification: lastEvidence?.classification ?? null,
    distanceM: lastEvidence?.distanceM ?? null,
    reason: r.resolutionReason,
  };
}
