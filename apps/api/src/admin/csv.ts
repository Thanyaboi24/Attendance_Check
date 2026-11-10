import type {
  AttendanceRequest,
  AttendanceSession,
  GeofenceConfiguration,
  LocationEvidence,
  NotificationEvent,
  User,
} from '@prisma/client';
import { formatBangkokDateTime, toBangkokDate } from '@attendance/shared';

/** RFC 4180 field quoting; also neutralises spreadsheet formula injection. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 (Thai names) correctly.
  return '﻿' + [header, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

const bkk = (d: Date | null | undefined) => (d ? formatBangkokDateTime(d) : '');
const secondsBetween = (a: Date | null | undefined, b: Date | null | undefined) =>
  a && b ? ((b.getTime() - a.getTime()) / 1000).toFixed(1) : '';

export function attendanceCsv(rows: (AttendanceSession & { user: User })[]): string {
  return toCsv(
    [
      'Staff ID',
      'Name',
      'Department',
      'Date',
      'Check-in (Asia/Bangkok)',
      'Check-in method',
      'Check-out (Asia/Bangkok)',
      'Check-out method',
      'Duration (hours)',
      'Status',
      'Corrected',
    ],
    rows.map((s) => [
      s.user.staffId,
      s.user.fullName,
      s.user.department,
      toBangkokDate(s.checkInAt),
      bkk(s.checkInAt),
      s.checkInMethod,
      bkk(s.checkOutAt),
      s.checkOutMethod ?? '',
      s.checkOutAt ? ((s.checkOutAt.getTime() - s.checkInAt.getTime()) / 3_600_000).toFixed(2) : '',
      s.status,
      s.corrected ? 'YES' : 'NO',
    ]),
  );
}

type EvalRow = AttendanceRequest & {
  user: User;
  config: GeofenceConfiguration;
  evidence: LocationEvidence[];
  notificationEvents: NotificationEvent[];
};

/**
 * One row per attendance request with every timestamp of design §8.3, used to compute the DS2
 * chapter-3 metrics (accuracy, precision/recall, uncertain rate, detection/notification/recording delay).
 * Times are UTC ISO-8601 for analysis.
 */
export function evaluationCsv(rows: EvalRow[]): string {
  return toCsv(
    [
      'requestId',
      'staffId',
      'type',
      'status',
      'method',
      'resolutionReason',
      'configVersion',
      'radiusM',
      'gracePeriodSec',
      'geofenceDetectedAt',
      'notificationStatus',
      'notificationPostedAt',
      'deadlineAt',
      'userConfirmedAt',
      'clientRecordedAt',
      'approvedAt',
      'serverCreatedAt',
      'detectionToNotificationSec',
      'notificationToRecordSec',
      'detectionToRecordSec',
      'evidenceCount',
      'lastEvidenceStage',
      'lastMeasuredAt',
      'lastAccuracyM',
      'lastDistanceM',
      'lastServerClassification',
      'lastClientClassification',
      'anyMock',
      'locationAttempts',
      'notificationEvents',
      'deviceModel',
      'deviceOs',
      'appVersion',
    ],
    rows.map((r) => {
      const last = r.evidence[r.evidence.length - 1];
      return [
        r.id,
        r.user.staffId,
        r.type,
        r.status,
        r.method ?? '',
        r.resolutionReason ?? '',
        r.configVersion,
        r.config.radiusM,
        r.config.gracePeriodSec,
        r.geofenceDetectedAt,
        r.notificationStatus ?? '',
        r.notificationPostedAt,
        r.deadlineAt,
        r.userConfirmedAt,
        r.clientRecordedAt,
        r.approvedAt,
        r.createdAt,
        secondsBetween(r.geofenceDetectedAt, r.notificationPostedAt),
        secondsBetween(r.notificationPostedAt, r.approvedAt),
        secondsBetween(r.geofenceDetectedAt, r.approvedAt),
        r.evidence.length,
        last?.stage ?? '',
        last?.measuredAt ?? '',
        last?.accuracyM ?? '',
        last?.distanceM?.toFixed(1) ?? '',
        last?.classification ?? '',
        last?.clientClassification ?? '',
        r.evidence.some((e) => e.isMock) ? 'YES' : 'NO',
        r.locationAttempts ?? '',
        r.notificationEvents.map((e) => `${e.type}@${e.occurredAt.toISOString()}${e.action ? `(${e.action})` : ''}`).join(' | '),
        r.deviceModel ?? '',
        r.deviceOs ?? '',
        r.appVersion ?? '',
      ];
    }),
  );
}
