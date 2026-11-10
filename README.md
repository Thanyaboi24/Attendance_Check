# Faculty Attendance: Staff Attendance Check Using Geofencing

Senior Project BL1-2026, SIIT, Thammasat University.
Design: [Android_Mobile_Architecture.md](Android_Mobile_Architecture.md) · API contract: [docs/API.md](docs/API.md)

A staff member's Android phone detects entering or leaving the faculty geofence and asks them to confirm with a notification. If they don't answer within the grace period, the app takes a **fresh** location fix. It records attendance automatically only when that fix confirms the user is still inside (check-in) or still outside (check-out). The backend re-checks every decision and is the source of truth.

## Repository layout

| Path | What | Stack |
|---|---|---|
| `packages/shared` | Location classifier, decision engine, zod API schemas, Asia/Bangkok time helpers, shared by all apps | TypeScript, zod 4, tsup, Vitest |
| `apps/api` | Backend: auth, RBAC, attendance processing, corrections, reports, audit, scheduled jobs | Node 22+, NestJS 11, PostgreSQL 16, Prisma 6, Jest |
| `apps/admin-web` | Administrator dashboard (Attendance Admin / System Admin) | React 19, Vite 7, TanStack Query, Google Maps JS API |
| `apps/mobile` | Staff Android app | React Native + Expo dev build, Kotlin WorkManager module |
| `docs/API.md` | REST contract (status codes, idempotency, result semantics) | |

## Quick start (development)

Requirements: Node ≥ 22, pnpm ≥ 10. Docker is optional.

```bash
pnpm install
pnpm --filter @attendance/shared build

# 1. Database: either Docker…
docker compose up -d postgres mailpit          # Postgres :5432, Mailpit UI http://localhost:8025
# …or without Docker (embedded PostgreSQL, data kept in apps/api/.local-pg):
pnpm --filter api db:local                     # Postgres :5433, keep this terminal open

# 2. API (new terminal)
cp apps/api/.env.example apps/api/.env         # set DATABASE_URL to :5433 if you used db:local; clear SMTP_HOST if Mailpit is not running
pnpm --filter api db:migrate
pnpm --filter api db:seed
pnpm --filter api dev                          # http://localhost:3000/api/v1, Swagger at /api/v1/docs

# 3. Admin web (new terminal)
pnpm --filter admin-web dev                    # http://localhost:5173

# 4. Mobile (needs Android SDK + emulator; Expo dev build, see apps/mobile/README.md)
pnpm android                                   # from the repo root; or `cd apps/mobile && npx expo run:android`
```

Seed accounts (development only):

| Email | Password | Role | Uses |
|---|---|---|---|
| `staff@siit.tu.ac.th` | `Staff1234` | STAFF | mobile app |
| `staff2@siit.tu.ac.th` | `Staff1234` | STAFF | mobile app |
| `attendance.admin@siit.tu.ac.th` | `Admin1234` | ATTENDANCE_ADMIN | admin web |
| `system.admin@siit.tu.ac.th` | `Admin1234` | SYSTEM_ADMIN | admin web |

Seed geofence v1: SIIT Rangsit, centre 14.0693, 100.6035, radius 150 m, grace period 300 s, max reading age 60 s, max accuracy 30 m.

## Commands

```bash
pnpm test                      # all packages (turbo)
pnpm typecheck
pnpm build
pnpm --filter api test         # e2e on a real PostgreSQL (embedded automatically, or TEST_DATABASE_URL)
```

## Roadmap status (design §15)

| Phase | Deliverable | Where |
|---|---|---|
| 0 | Monorepo, shared package, NestJS skeleton, Docker Compose | root, `packages/shared`, `docker-compose.yml` |
| 1 | Login, JWT + rotating refresh tokens, argon2id, lockout, RBAC, activation/reset links | `apps/api/src/auth`, `apps/mobile/src/features/auth`, `apps/admin-web` login pages |
| 2 | Prisma schema + integrity migration (one open session, one active request, CHECK constraints, append-only audit), state machine | `apps/api/prisma`, `packages/shared/src/domain` |
| 3 | Staff dashboard/history; admin dashboard, sessions, requests | mobile + admin web |
| 4 | Fresh location, flat-earth classifier, map screens | `packages/shared` classifier, mobile `locationMap`, admin maps |
| 5 | Manual attendance | `POST /attendance/requests/{id}/confirm`, mobile confirm flow |
| 6 | Geofence registration, notifications, pending requests | mobile `services/location`, `services/notifications` |
| 7 | Automatic attendance with fresh validation | mobile `modules/attendance-scheduler` (WorkManager) + `GracePeriodTask`; `POST …/auto` |
| 8 | Duplicate prevention & failure handling | request-id idempotency + row locks (API), mobile outbox/sync |
| 9 | Correction requests & audit | `/corrections`, `/admin/corrections`, audit log, admin UI |
| 10 | Field-testing support | mobile event-log export, `GET /admin/reports/evaluation.csv` |

The DS2 §3.6 functional scenarios are covered by tests named after them, in `packages/shared/test` and `apps/api/test`, plus the mobile use-case tests. Scenario 15 (background/locked/killed phone) can only be measured in field tests on real devices.

## Notes and known limitations

- **Mobile native code is uncompiled.** No Android SDK was available while building, so `apps/mobile/modules/attendance-scheduler` (Kotlin: WorkManager, headless service, boot receiver) has never been compiled or run. The JS side typechecks, its 68 tests pass, and `expo export` bundles it. The first job on a machine with Android Studio is `pnpm android` from the repo root, or `npx expo run:android` inside `apps/mobile` (see `apps/mobile/README.md`).
- **Android builds on Windows** need CMake 3.31.x (Android Studio → SDK Manager → SDK Tools → CMake). The default 3.22.1 includes an old `ninja` that fails with "Filename longer than 260 characters". Point the build at it in `apps/mobile/android/local.properties` with `sdk.dir=…/Android/Sdk` and `cmake.dir=…/Android/Sdk/cmake/3.31.6`. pnpm uses `nodeLinker: hoisted` for the same reason; keep admin-web's React version equal to the mobile app's so only one copy is hoisted.
- **Emulator GPX testing:** Android may flag emulator fixes as mock locations, which the API rejects. For local testing only, set `ALLOW_MOCK_LOCATION=true` in `apps/api/.env`. The API refuses to start with it in production.
- **Offline manual confirmation:** evidence must be fresh (≤ 60 s) by **server** time. A manual confirmation queued offline and synced later is therefore not approved (DS2 §2.10.1). The app falls back to a new fresh-fix evaluation or a correction request.
- **Docker image** (`apps/api/Dockerfile`) has not been built here, because Docker was not available on the development machine.
- Open issues from the design (§13) still apply: data retention period (`EVIDENCE_RETENTION_DAYS`), OEM background killers / Doze delays (measure in field tests), institutional SSO, iOS.
