import {
  type AttendanceActionResult,
  type AttendanceRequestDto,
  type AttendanceStateResponse,
  type AutoAttendance,
  type CancelAttendance,
  classify,
  type ConfirmAttendance,
  type CorrectionDto,
  type CreateAttendanceRequest,
  type CreateCorrection,
  deriveAttendanceState,
  type EvidenceInput,
  expectedClassFor,
  type GeofenceConfig,
  GRACE_CLOCK_SKEW_SEC,
  type HistoryResponse,
  type NotificationEventInput,
  oppositeClassFor,
  type SessionDto,
  type UnresolvedAttendance,
} from '@attendance/shared';
import { ApiRequestError, NetworkError } from '../../src/domain/errors';
import type { AttendanceApi } from '../../src/domain/ports';

type Method = keyof AttendanceApi;

/**
 * A small in-memory simulation of the NestJS backend, following docs/API.md: idempotent actions (stored result),
 * server-side re-classification with the request's config version and the *server* receive time, 409/422 codes.
 */
export class FakeBackend implements AttendanceApi {
  offline = false;
  configs = new Map<number, GeofenceConfig>();
  activeVersion: number;
  openSession: SessionDto | null = null;
  sessions: SessionDto[] = [];
  requests = new Map<string, AttendanceRequestDto>();
  results = new Map<string, AttendanceActionResult>();
  calls: Array<{ method: Method; requestId?: string; body?: unknown }> = [];
  notificationEvents: NotificationEventInput[] = [];
  corrections: CorrectionDto[] = [];
  /** Errors to throw on the next call(s) of a method (consumed in order). */
  private injected = new Map<Method, Error[]>();
  /** Simulates "server processed the request but the response was lost" for the next call of a method. */
  private loseResponse = new Set<Method>();
  private seq = 0;

  constructor(
    cfg: GeofenceConfig,
    private readonly serverNow: () => Date,
  ) {
    this.configs.set(cfg.version, cfg);
    this.activeVersion = cfg.version;
  }

  failNext(method: Method, error: Error, times = 1) {
    const list = this.injected.get(method) ?? [];
    for (let i = 0; i < times; i++) list.push(error);
    this.injected.set(method, list);
  }
  loseNextResponse(method: Method) {
    this.loseResponse.add(method);
  }
  callsOf(method: Method) {
    return this.calls.filter((c) => c.method === method);
  }

  private enter(method: Method, requestId?: string, body?: unknown) {
    this.calls.push({ method, requestId, body });
    if (this.offline) throw new NetworkError('offline');
    const list = this.injected.get(method);
    const err = list?.shift();
    if (err) throw err;
  }
  private leave<T>(method: Method, value: T): T {
    if (this.loseResponse.delete(method)) throw new NetworkError('response lost');
    return value;
  }
  private now() {
    return this.serverNow().toISOString();
  }

  async getState(): Promise<AttendanceStateResponse> {
    this.enter('getState');
    const active = [...this.requests.values()].find((r) => r.status === 'ACTIVE') ?? null;
    return {
      state: deriveAttendanceState(this.openSession != null, active?.type ?? null),
      openSession: this.openSession,
      activeRequest: active,
      todaySessions: this.sessions,
      activeConfigVersion: this.activeVersion,
      serverTime: this.now(),
    };
  }
  async getActiveConfig() {
    this.enter('getActiveConfig');
    return this.configs.get(this.activeVersion) as GeofenceConfig;
  }
  async getConfig(version: number) {
    this.enter('getConfig');
    const c = this.configs.get(version);
    if (!c) throw new ApiRequestError(404, 'CONFIG_VERSION_UNKNOWN', 'unknown');
    return c;
  }

  async createRequest(body: CreateAttendanceRequest): Promise<AttendanceRequestDto> {
    this.enter('createRequest', body.requestId, body);
    const existing = this.requests.get(body.requestId);
    if (existing) return this.leave('createRequest', existing);
    const cfg = this.configs.get(body.configVersion);
    if (!cfg) throw new ApiRequestError(404, 'CONFIG_VERSION_UNKNOWN', 'unknown config');
    if (body.type === 'CHECK_IN' && this.openSession) throw new ApiRequestError(409, 'SESSION_ALREADY_OPEN', 'open');
    if (body.type === 'CHECK_OUT' && !this.openSession) throw new ApiRequestError(409, 'NO_OPEN_SESSION', 'none');
    const other = [...this.requests.values()].find((r) => r.status === 'ACTIVE');
    if (other) {
      if (Date.parse(other.deadlineAt) > this.serverNow().getTime()) {
        throw new ApiRequestError(409, 'ACTIVE_REQUEST_EXISTS', 'active', { activeRequest: other });
      }
      other.status = 'UNRESOLVED';
      other.resolutionReason = 'SUPERSEDED';
    }
    const anchor = body.notificationPostedAt ?? body.geofenceDetectedAt;
    const dto: AttendanceRequestDto = {
      id: body.requestId,
      type: body.type,
      status: 'ACTIVE',
      method: null,
      sessionId: null,
      configVersion: body.configVersion,
      geofenceDetectedAt: body.geofenceDetectedAt,
      notificationStatus: body.notificationStatus,
      notificationPostedAt: body.notificationPostedAt,
      deadlineAt: new Date(Date.parse(anchor) + cfg.gracePeriodSec * 1000).toISOString(),
      approvedAt: null,
      resolutionReason: null,
      createdAt: this.now(),
    };
    this.requests.set(dto.id, dto);
    return this.leave('createRequest', dto);
  }

  private classifyServer(req: AttendanceRequestDto, ev: EvidenceInput) {
    const cfg = this.configs.get(req.configVersion) as GeofenceConfig;
    return classify(
      { lat: ev.lat, lng: ev.lng, accuracyM: ev.accuracyM, measuredAt: ev.measuredAt, isMock: ev.isMock ?? false },
      cfg,
      this.serverNow(),
    );
  }

  private finish(
    req: AttendanceRequestDto,
    status: AttendanceActionResult['status'],
    extra: Partial<AttendanceActionResult>,
  ): AttendanceActionResult {
    const result: AttendanceActionResult = {
      requestId: req.id,
      status,
      sessionId: null,
      method: null,
      officialTime: null,
      classification: null,
      distanceM: null,
      reason: null,
      ...extra,
    };
    if (status === 'APPROVED') {
      const t = this.now();
      if (req.type === 'CHECK_IN') {
        const s: SessionDto = {
          id: `session-${++this.seq}`,
          checkInAt: t,
          checkInMethod: result.method ?? 'MANUAL',
          checkOutAt: null,
          checkOutMethod: null,
          status: 'OPEN',
          corrected: false,
        };
        this.openSession = s;
        this.sessions.push(s);
        result.sessionId = s.id;
      } else if (this.openSession) {
        const closed = { ...this.openSession, checkOutAt: t, checkOutMethod: result.method ?? 'MANUAL', status: 'COMPLETED' as const };
        this.sessions = this.sessions.map((s) => (s.id === closed.id ? closed : s));
        result.sessionId = closed.id;
        this.openSession = null;
      }
      result.officialTime = t;
      req.approvedAt = t;
    }
    req.status = status;
    req.method = result.method;
    req.sessionId = result.sessionId;
    req.resolutionReason = result.reason;
    this.results.set(req.id, result);
    return result;
  }

  private load(id: string): AttendanceRequestDto {
    const req = this.requests.get(id);
    if (!req) throw new ApiRequestError(404, 'NOT_FOUND', 'request not found');
    return req;
  }

  private sessionValid(req: AttendanceRequestDto) {
    return req.type === 'CHECK_IN' ? this.openSession == null : this.openSession != null;
  }

  async confirm(id: string, body: ConfirmAttendance): Promise<AttendanceActionResult> {
    this.enter('confirm', id, body);
    const req = this.load(id);
    const stored = this.results.get(id);
    if (stored) return this.leave('confirm', stored);
    const c = this.classifyServer(req, body.evidence);
    if (body.evidence.isMock) return this.leave('confirm', this.finish(req, 'REJECTED', { reason: 'MOCK_LOCATION' }));
    if (!this.sessionValid(req)) {
      return this.leave('confirm', this.finish(req, 'REJECTED', { reason: req.type === 'CHECK_IN' ? 'SESSION_ALREADY_OPEN' : 'NO_OPEN_SESSION' }));
    }
    if (c.classification !== expectedClassFor(req.type)) {
      throw new ApiRequestError(422, 'LOCATION_NOT_CONFIRMED', 'not confirmed', {
        classification: c.classification,
        distanceM: c.distanceM,
        uncertainReason: c.uncertainReason,
      });
    }
    return this.leave(
      'confirm',
      this.finish(req, 'APPROVED', { method: 'MANUAL', classification: c.classification, distanceM: c.distanceM }),
    );
  }

  async auto(id: string, body: AutoAttendance): Promise<AttendanceActionResult> {
    this.enter('auto', id, body);
    const req = this.load(id);
    const stored = this.results.get(id);
    if (stored) return this.leave('auto', stored);
    if (this.serverNow().getTime() + GRACE_CLOCK_SKEW_SEC * 1000 < Date.parse(req.deadlineAt)) {
      throw new ApiRequestError(409, 'GRACE_PERIOD_NOT_EXPIRED', 'too early');
    }
    if (!req.notificationPostedAt) return this.leave('auto', this.finish(req, 'UNRESOLVED', { reason: 'NOTIFICATION_FAILED' }));
    if (body.evidence.isMock) return this.leave('auto', this.finish(req, 'REJECTED', { reason: 'MOCK_LOCATION' }));
    if (!this.sessionValid(req)) {
      return this.leave('auto', this.finish(req, 'REJECTED', { reason: req.type === 'CHECK_IN' ? 'SESSION_ALREADY_OPEN' : 'NO_OPEN_SESSION' }));
    }
    const c = this.classifyServer(req, body.evidence);
    const extra = { classification: c.classification, distanceM: c.distanceM };
    if (c.classification === expectedClassFor(req.type)) {
      return this.leave('auto', this.finish(req, 'APPROVED', { ...extra, method: 'AUTOMATIC' }));
    }
    if (c.classification === oppositeClassFor(req.type)) {
      return this.leave('auto', this.finish(req, 'CANCELLED', { ...extra, reason: 'CONFIRMED_OPPOSITE_SIDE' }));
    }
    return this.leave('auto', this.finish(req, 'UNRESOLVED', { ...extra, reason: 'UNCERTAIN_LOCATION' }));
  }

  async cancel(id: string, body: CancelAttendance): Promise<AttendanceActionResult> {
    this.enter('cancel', id, body);
    const req = this.load(id);
    const stored = this.results.get(id);
    if (stored) return this.leave('cancel', stored);
    const c = this.classifyServer(req, body.evidence);
    if (c.classification !== oppositeClassFor(req.type)) {
      throw new ApiRequestError(422, 'LOCATION_NOT_CONFIRMED', 'not confirmed', { classification: c.classification });
    }
    return this.leave(
      'cancel',
      this.finish(req, 'CANCELLED', { reason: 'CONFIRMED_OPPOSITE_SIDE', classification: c.classification, distanceM: c.distanceM }),
    );
  }

  async unresolved(id: string, body: UnresolvedAttendance): Promise<AttendanceActionResult> {
    this.enter('unresolved', id, body);
    const req = this.load(id);
    const stored = this.results.get(id);
    if (stored) return this.leave('unresolved', stored);
    return this.leave('unresolved', this.finish(req, 'UNRESOLVED', { reason: body.reason }));
  }

  async postNotificationEvent(body: NotificationEventInput) {
    this.enter('postNotificationEvent', body.requestId, body);
    this.notificationEvents.push(body);
  }
  async history(): Promise<HistoryResponse> {
    this.enter('history');
    return { sessions: this.sessions, issues: [] };
  }
  async createCorrection(body: CreateCorrection): Promise<CorrectionDto> {
    this.enter('createCorrection', undefined, body);
    const existing = this.corrections.find((c) => c.id === body.correctionId);
    if (existing) return existing;
    const dto: CorrectionDto = {
      id: body.correctionId,
      user: { id: 'u1', fullName: 'Staff' },
      sessionId: body.sessionId,
      workDate: body.workDate,
      requestedCheckInAt: body.requestedCheckInAt,
      requestedCheckOutAt: body.requestedCheckOutAt,
      reason: body.reason,
      status: 'PENDING',
      reviewNote: null,
      reviewer: null,
      reviewedAt: null,
      createdAt: this.now(),
    };
    this.corrections.push(dto);
    return dto;
  }
  async listCorrections() {
    this.enter('listCorrections');
    return this.corrections;
  }
}
