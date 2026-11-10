# Backend API Contract (v1)

Base URL: `https://<host>/api/v1` (dev: `http://localhost:3000/api/v1`, Android emulator: `http://10.0.2.2:3000/api/v1`).
All bodies are JSON. Every request/response schema lives in `packages/shared/src/schemas` (zod); the names below refer to those exports.
Times are UTC ISO-8601 strings; calendar dates (`YYYY-MM-DD`) are Asia/Bangkok days.

## Conventions

| Item | Rule |
|---|---|
| Auth | `Authorization: Bearer <accessToken>` (JWT, 15 min). Refresh with `/auth/refresh` (refresh tokens rotate; old one is revoked). |
| Idempotency | Every attendance write and `POST /corrections` sends `Idempotency-Key: <uuid>`. For `/attendance/requests/{id}/*` it **must equal `{id}`**; for `POST /attendance/requests` it must equal `requestId`; for `POST /corrections` it must equal `correctionId`. Mismatch → `400 IDEMPOTENCY_KEY_MISMATCH`. |
| Errors | Non-2xx bodies are `ApiError` = `{ code, message, details? }`. `code` is one of `ErrorCode` in `packages/shared/src/enums.ts`. |
| Validation | Invalid body/query → `400 VALIDATION_FAILED` with `details` = zod issues. |
| Ownership | Staff endpoints always use the user id from the token. Accessing another user's data → `403 FORBIDDEN` / `404 NOT_FOUND`. |
| Account | A non-`ACTIVE` account gets `403 ACCOUNT_INACTIVE` on every authenticated call; its refresh tokens are revoked. |

## Auth (public)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| POST | `/auth/login` | `LoginRequestSchema` | `LoginResponse` | `401 INVALID_CREDENTIALS` (generic message, never reveals whether the email exists), `423 ACCOUNT_LOCKED` after 5 failures in 15 min, `403 ACCOUNT_INACTIVE`. Any role may log in; the **mobile app** shows "use the Admin Web" for non-STAFF roles, the **admin web** rejects STAFF. |
| POST | `/auth/refresh` | `RefreshRequestSchema` | `TokenPair` | `401 TOKEN_INVALID` |
| POST | `/auth/logout` | `LogoutRequestSchema` | `{ ok: true }` | revokes the refresh token |
| POST | `/auth/password/forgot` | `ForgotPasswordRequestSchema` | `{ ok: true }` | always 200; sends a single-use link (30 min) |
| POST | `/auth/password/reset` | `SetPasswordWithTokenSchema` | `{ ok: true }` | `400 TOKEN_INVALID` |
| POST | `/auth/activate` | `SetPasswordWithTokenSchema` | `{ ok: true }` | activation link (24 h); sets status `ACTIVE` |

Links in emails: `${APP_LINK_BASE}/activate?token=…` and `${APP_LINK_BASE}/reset-password?token=…` — served by the admin web; the mobile app also handles the deep links `facultyattendance://activate?token=…` / `facultyattendance://reset-password?token=…`.

## Staff (role `STAFF`)

| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/me` | — | `UserProfile` (any role) |
| GET | `/geofence/config/active` | — | `GeofenceConfig` (any role) |
| GET | `/geofence/config/{version}` | — | `GeofenceConfig` — pending requests keep their original version (DS2 §2.9.5) |
| GET | `/attendance/state` | — | `AttendanceStateResponse` |
| GET | `/attendance/history` | `?from=YYYY-MM-DD&to=YYYY-MM-DD` | `HistoryResponse` |
| POST | `/attendance/requests` | `CreateAttendanceRequestSchema` | `201 AttendanceRequestDto` (`200` with the same DTO if `requestId` already exists for this user) |
| POST | `/attendance/requests/{id}/confirm` | `ConfirmAttendanceSchema` | `AttendanceActionResult` |
| POST | `/attendance/requests/{id}/auto` | `AutoAttendanceSchema` | `AttendanceActionResult` |
| POST | `/attendance/requests/{id}/cancel` | `CancelAttendanceSchema` | `AttendanceActionResult` |
| POST | `/attendance/requests/{id}/unresolved` | `UnresolvedAttendanceSchema` | `AttendanceActionResult` |
| POST | `/notification-events` | `NotificationEventSchema` | `{ ok: true }` |
| POST | `/corrections` | `CreateCorrectionSchema` | `201 CorrectionDto` (`200` same DTO on retry) |
| GET | `/corrections` | — | `CorrectionDto[]` (own, newest first) |

### Attendance request semantics

**Create** (`POST /attendance/requests`) — sent after the notification was presented (or failed):
- `deadlineAt` = anchor + `gracePeriodSec` of the request's `configVersion`, where anchor = `notificationPostedAt` (or `geofenceDetectedAt` if not posted) clamped to `[serverNow − 1 h, serverNow]`.
- `409 SESSION_ALREADY_OPEN` — CHECK_IN while a session is open.
- `409 NO_OPEN_SESSION` — CHECK_OUT without an open session (scenario 11).
- `409 ACTIVE_REQUEST_EXISTS` (`details.activeRequest`) — another request is still ACTIVE and its deadline has not passed. If its deadline **has** passed it is marked `UNRESOLVED` (`resolutionReason = SUPERSEDED`) and the new request is accepted.
- `404 CONFIG_VERSION_UNKNOWN` — `configVersion` does not exist.

**Actions** (`confirm` / `auto` / `cancel` / `unresolved`), all processed in one DB transaction with a row lock on the request:
- If the request is **no longer `ACTIVE`**, the endpoint returns `200` with the **stored result** (idempotent; the loser of a manual/auto race receives the winner's result — scenarios 9–10).
- The server **re-classifies** the evidence with `classify()` from `packages/shared`, using the request's config version and the server receive time. `clientClassification` is stored but never trusted.
- `evidence.isMock = true` → request `REJECTED`, `reason = MOCK_LOCATION` (200).

| Endpoint | Server classification | Result |
|---|---|---|
| confirm | expected side (Inside for CHECK_IN, Outside for CHECK_OUT) and session state valid | `APPROVED`, `method = MANUAL`, `officialTime = server time` |
| confirm | anything else | `422 LOCATION_NOT_CONFIRMED` (`details: { classification, distanceM, uncertainReason }`); request stays `ACTIVE` so the user can retry or file a correction |
| confirm/auto | session state invalid (CHECK_IN with open session / CHECK_OUT without) | `REJECTED`, `reason = SESSION_ALREADY_OPEN` / `NO_OPEN_SESSION` (200, idempotent like every other result) |
| auto | grace not expired (`serverNow + 30 s < deadlineAt`) | `409 GRACE_PERIOD_NOT_EXPIRED`; request stays `ACTIVE` |
| auto | request has no `notificationPostedAt` | `UNRESOLVED`, `reason = NOTIFICATION_FAILED` |
| auto | expected side | `APPROVED`, `method = AUTOMATIC` |
| auto | opposite side | `CANCELLED`, `reason = CONFIRMED_OPPOSITE_SIDE` |
| auto | UNCERTAIN | `UNRESOLVED`, `reason = UNCERTAIN_LOCATION` |
| cancel | opposite side | `CANCELLED` |
| cancel | anything else | `422 LOCATION_NOT_CONFIRMED`; stays `ACTIVE` |
| unresolved | — | `UNRESOLVED` with the given reason |

Official attendance time is always the server approval time (never backdated). Evidence older than the freshness limit is still stored for review but classifies as UNCERTAIN.

## Admin (`ATTENDANCE_ADMIN` = AA, `SYSTEM_ADMIN` = SA)

| Method | Path | Roles | Body / Query | Response |
|---|---|---|---|---|
| GET | `/admin/dashboard/summary` | AA, SA | — | `DashboardSummary` |
| GET | `/admin/attendance/sessions` | AA | `AdminSessionQuerySchema` | `Paginated<AdminSessionDto>` |
| PATCH | `/admin/attendance/sessions/{id}` | AA | `AdminEditSessionSchema` | `AdminSessionDto` (method → `ADMIN_CORRECTED`, `corrected = true`, audit log with previous/new values) |
| GET | `/admin/attendance/requests` | AA | `AdminRequestQuerySchema` | `Paginated<AdminRequestDto>` |
| GET | `/admin/attendance/requests/{id}` | AA | — | `AdminRequestDetail` (evidence + config for the map) |
| GET | `/admin/corrections` | AA | `AdminCorrectionQuerySchema` | `Paginated<CorrectionDto>` |
| POST | `/admin/corrections/{id}/review` | AA | `ReviewCorrectionSchema` | `CorrectionDto`; APPROVE updates/creates the session (`ADMIN_CORRECTED`) in the same transaction + audit log. `409 CORRECTION_NOT_PENDING` |
| GET | `/admin/reports/attendance.csv` | AA | `?from&to&department?` | `text/csv` (Bangkok times) |
| GET | `/admin/reports/evaluation.csv` | AA, SA | `?from&to` | `text/csv`, one row per attendance request with every timestamp of design §8.3, device, config version, distance, classification — for the DS2 chapter-3 metrics |
| GET | `/admin/users` | SA | `UserListQuerySchema` | `Paginated<AdminUserDto>` |
| POST | `/admin/users` | SA | `CreateUserSchema` | `201 AdminUserDto` (status `PENDING_ACTIVATION`, activation email sent). `409` on duplicate staffId/email |
| PATCH | `/admin/users/{id}` | SA | `UpdateUserSchema` | `AdminUserDto`; deactivation revokes refresh tokens |
| POST | `/admin/users/{id}/resend-activation` | SA | — | `{ ok: true }` |
| GET | `/admin/geofence/configs` | AA, SA | — | `GeofenceConfig[]` newest first |
| PUT | `/admin/geofence/config` | SA | `UpdateGeofenceConfigSchema` | `GeofenceConfig` (new version) |
| GET | `/admin/audit-logs` | AA, SA | `AuditLogQuerySchema` | `Paginated<AuditLogDto>` |

## Misc

| Method | Path | Response |
|---|---|---|
| GET | `/health` | `{ status: 'ok', db: 'up' }` |
| GET | `/docs` | Swagger UI (non-production) |

## Seed accounts (development only)

| Email | Password | Role |
|---|---|---|
| `staff@siit.tu.ac.th` | `Staff1234` | STAFF |
| `staff2@siit.tu.ac.th` | `Staff1234` | STAFF |
| `attendance.admin@siit.tu.ac.th` | `Admin1234` | ATTENDANCE_ADMIN |
| `system.admin@siit.tu.ac.th` | `Admin1234` | SYSTEM_ADMIN |

Seed geofence v1: SIIT Rangsit, centre `14.0693, 100.6035`, radius 150 m, grace 300 s, max age 60 s, max accuracy 30 m.
