import {
  AttendanceActionResultSchema,
  AttendanceRequestDtoSchema,
  AttendanceStateResponseSchema,
  CorrectionDtoSchema,
  GeofenceConfigSchema,
  HistoryResponseSchema,
  LoginResponseSchema,
  OkResponseSchema,
  UserProfileSchema,
} from '@attendance/shared';
import type { AxiosInstance, AxiosResponse } from 'axios';
import { z } from 'zod';
import { ContractError } from '../../domain/errors';
import type { AttendanceApi, AuthApi } from '../../domain/ports';
import { toDomainError } from './client';

/** Calls an endpoint and validates the response with the shared zod contract. */
async function call<S extends z.ZodType>(schema: S, request: () => Promise<AxiosResponse>, what: string): Promise<z.output<S>> {
  let res: AxiosResponse;
  try {
    res = await request();
  } catch (e) {
    throw toDomainError(e);
  }
  const parsed = schema.safeParse(res.data);
  if (!parsed.success) {
    throw new ContractError(`Unexpected response from ${what}: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  }
  return parsed.data;
}

const idem = (key: string) => ({ headers: { 'Idempotency-Key': key } });
const enc = encodeURIComponent;

export function createAttendanceApi(http: AxiosInstance): AttendanceApi {
  return {
    getState: () => call(AttendanceStateResponseSchema, () => http.get('/attendance/state'), 'GET /attendance/state'),
    getActiveConfig: () => call(GeofenceConfigSchema, () => http.get('/geofence/config/active'), 'GET /geofence/config/active'),
    getConfig: (version) =>
      call(GeofenceConfigSchema, () => http.get(`/geofence/config/${version}`), `GET /geofence/config/${version}`),
    createRequest: (body) =>
      call(AttendanceRequestDtoSchema, () => http.post('/attendance/requests', body, idem(body.requestId)), 'POST /attendance/requests'),
    confirm: (id, body) =>
      call(AttendanceActionResultSchema, () => http.post(`/attendance/requests/${enc(id)}/confirm`, body, idem(id)), 'confirm'),
    auto: (id, body) =>
      call(AttendanceActionResultSchema, () => http.post(`/attendance/requests/${enc(id)}/auto`, body, idem(id)), 'auto'),
    cancel: (id, body) =>
      call(AttendanceActionResultSchema, () => http.post(`/attendance/requests/${enc(id)}/cancel`, body, idem(id)), 'cancel'),
    unresolved: (id, body) =>
      call(AttendanceActionResultSchema, () => http.post(`/attendance/requests/${enc(id)}/unresolved`, body, idem(id)), 'unresolved'),
    postNotificationEvent: async (body) => {
      await call(z.unknown(), () => http.post('/notification-events', body), 'POST /notification-events');
    },
    history: (from, to) =>
      call(HistoryResponseSchema, () => http.get('/attendance/history', { params: { from, to } }), 'GET /attendance/history'),
    createCorrection: (body) =>
      call(CorrectionDtoSchema, () => http.post('/corrections', body, idem(body.correctionId)), 'POST /corrections'),
    listCorrections: () => call(z.array(CorrectionDtoSchema), () => http.get('/corrections'), 'GET /corrections'),
  };
}

export function createAuthApi(http: AxiosInstance, publicHttp: AxiosInstance): AuthApi {
  return {
    login: (body) => call(LoginResponseSchema, () => publicHttp.post('/auth/login', body), 'POST /auth/login'),
    logout: async (refreshToken) => {
      await call(OkResponseSchema, () => publicHttp.post('/auth/logout', { refreshToken }), 'POST /auth/logout');
    },
    me: () => call(UserProfileSchema, () => http.get('/me'), 'GET /me'),
    forgotPassword: async (email) => {
      await call(OkResponseSchema, () => publicHttp.post('/auth/password/forgot', { email }), 'POST /auth/password/forgot');
    },
    activate: async (body) => {
      await call(OkResponseSchema, () => publicHttp.post('/auth/activate', body), 'POST /auth/activate');
    },
    resetPassword: async (body) => {
      await call(OkResponseSchema, () => publicHttp.post('/auth/password/reset', body), 'POST /auth/password/reset');
    },
  };
}
