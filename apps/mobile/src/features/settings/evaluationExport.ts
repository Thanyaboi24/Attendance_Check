import type { DeviceInfo } from '@attendance/shared';
import type { EventLogEntry, EvidenceRecord, LocalRequest } from '../../domain/models';

/**
 * Evaluation export (design §8.3, §14; DS2 §3.7): every timestamp of a request plus device, config version,
 * distance and classification, so Accuracy / Precision / Recall / F1, uncertain rate and delays can be computed.
 */
export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
}

export const REQUEST_COLUMNS = [
  'requestId',
  'type',
  'status',
  'method',
  'configVersion',
  'geofenceDetectedAt',
  'notificationStatus',
  'notificationPostedAt',
  'userConfirmedAt',
  'locationMeasuredAt',
  'accuracyM',
  'distanceM',
  'classification',
  'uncertainReason',
  'isMock',
  'locationAttempts',
  'officialTime',
  'resolutionReason',
  'syncStatus',
  'deviceModel',
  'deviceOs',
  'appVersion',
] as const;

export function requestsCsv(requests: LocalRequest[], evidence: Map<string, EvidenceRecord[]>, device: DeviceInfo | undefined): string {
  const rows = requests.map((r) => {
    const ev = evidence.get(r.requestId) ?? [];
    const last = ev[ev.length - 1];
    return [
      r.requestId,
      r.type,
      r.status,
      r.method,
      r.configVersion,
      r.geofenceDetectedAt,
      r.notificationStatus,
      r.notificationPostedAt,
      r.userConfirmedAt,
      last?.measuredAt,
      last?.accuracyM,
      last?.distanceM != null ? Math.round(last.distanceM * 10) / 10 : null,
      last?.classification ?? r.lastClassification,
      last?.uncertainReason,
      last?.isMock,
      ev.filter((e) => e.purpose === 'AUTO').length || null,
      r.officialTime,
      r.resolutionReason,
      r.localAction ? 'PENDING_SYNC' : r.syncStatus,
      device?.model,
      device?.os,
      device?.appVersion,
    ];
  });
  return toCsv([...REQUEST_COLUMNS], rows);
}

export function eventsCsv(events: EventLogEntry[]): string {
  return toCsv(
    ['id', 'at', 'type', 'requestId', 'detail'],
    events.map((e) => [e.id, e.at, e.type, e.requestId, e.detail]),
  );
}

export function evaluationJson(input: {
  exportedAt: string;
  device: DeviceInfo | undefined;
  requests: LocalRequest[];
  evidence: Map<string, EvidenceRecord[]>;
  events: EventLogEntry[];
}): string {
  return JSON.stringify(
    {
      exportedAt: input.exportedAt,
      device: input.device ?? null,
      requests: input.requests.map((r) => ({ ...r, evidence: input.evidence.get(r.requestId) ?? [] })),
      events: input.events,
    },
    null,
    2,
  );
}
