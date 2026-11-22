# Faculty Attendance: Staff Attendance Check Using Geofencing

Senior Project BL1-2026, Sirindhorn International Institute of Technology (SIIT), Thammasat University.

Staff check in and out by arriving at and leaving campus with an Android phone. The app detects entering or leaving a campus geofence and sends a notification asking the staff member to confirm. If they don't answer within the grace period, the phone takes a **fresh** GPS fix. It records attendance automatically only when that fix confirms they are still inside (check-in) or still outside (check-out). The backend re-checks every decision and is the source of truth. Administrators review attendance, corrections and reports on a web dashboard.

Both apps are available in **English and Thai (ภาษาไทย)**.

- Design document: [Android_Mobile_Architecture.md](Android_Mobile_Architecture.md)
- REST API contract: [docs/API.md](docs/API.md)
- Translation rules and Thai glossary: [docs/i18n.md](docs/i18n.md)
- Mobile app details: [apps/mobile/README.md](apps/mobile/README.md)

---

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Architecture](#architecture)
4. [Requirements](#requirements)
5. [Getting started](#getting-started)
6. [Configuration](#configuration)
7. [Testing](#testing)
8. [Project structure](#project-structure)
9. [Technical details](#technical-details)
10. [Troubleshooting](#troubleshooting)
11. [Known limitations](#known-limitations)

---

## Features

**Staff mobile app (Android)**
- Sign up from the app with staff ID, name, department and institutional email; an administrator approves the account before the first sign-in
- Automatic check-in/check-out from geofence enter/exit events, with a confirmation notification and a grace period
- Fresh-location validation before anything is recorded: maximum reading age, accuracy limit and mock-location detection
- Several attendance areas, such as SIIT Rangsit and SIIT Bangkadi; a staff member can check in at either campus
- A live location map showing distance, accuracy and an inside, outside or uncertain status
- Attendance history with date-range and method filters
- Correction requests for missed or wrong records
- Working hours per week and month, checked against the standard 7–9 hour working day
- Holiday calendar (Thai public holidays): on a holiday the app shows that nobody needs to come in and check-in is locked
- Works offline: actions are queued in a local SQLite outbox and synced later with idempotent requests
- Exportable evaluation log (CSV/JSON) for field testing
- English and Thai, switchable in Settings, with Thai dates in the Buddhist Era year

**Admin web dashboard**
- Sign-up requests: approve or reject staff self-registrations (a reason is required to reject; the applicant is emailed either way)
- Today's overview, attendance sessions, attendance requests and their location evidence on a map
- Correction review (approve/reject with a note)
- User management: create users, activation emails, lock/unlock and roles
- Geofence configuration with versions and up to 10 areas, each with its own centre and radius; every change needs a reason and is audited
- Holiday calendar management (Thai public holidays pre-loaded; add university closures or newly announced days)
- CSV reports and an append-only audit log
- Two roles: **Attendance Admin** and **System Admin**
- English and Thai, switchable in the sidebar and on the sign-in page

**Backend API**
- JWT access tokens, rotating refresh tokens, argon2id password hashing, account lockout and role-based access control
- Server-side re-validation of every attendance decision
- Database constraints: one open session per user, one active request per user, CHECK constraints and an append-only audit log
- Idempotency keys and row locks, so retries never create duplicate records
- Scheduled jobs for expiring requests and evidence retention
- Swagger/OpenAPI documentation

---

## Tech stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces, Turborepo, TypeScript (strict) |
| Shared domain (`packages/shared`) | TypeScript, zod 4 schemas, tsup, Vitest |
| Backend (`apps/api`) | Node.js 22+, NestJS 11, Prisma 6, PostgreSQL 16, argon2, Nodemailer, @nestjs/schedule, Swagger, Jest + Supertest |
| Admin web (`apps/admin-web`) | React 19, Vite 7, React Router 7, TanStack Query 5, React Hook Form + zod, Google Maps JS API (`@vis.gl/react-google-maps`) with an SVG fallback, i18next, Vitest + Testing Library |
| Mobile (`apps/mobile`) | React Native 0.88, Expo SDK 58 (development build, New Architecture/Hermes), expo-location, expo-task-manager, expo-notifications, expo-sqlite, expo-secure-store, react-native-maps, React Native Paper, React Navigation 7, zustand, axios, i18next, Jest (jest-expo) |
| Native Android | Local Expo module in Kotlin (`modules/attendance-scheduler`): WorkManager, a Headless JS service and a boot receiver |
| Dev infrastructure | Docker Compose (PostgreSQL and Mailpit); embedded PostgreSQL if Docker isn't available |

---

## Architecture

```
┌──────────────────────┐        HTTPS / JSON         ┌───────────────────────────┐
│  Android app (Expo)  │ ──────────────────────────▶ │  NestJS API  /api/v1      │
│  geofence + GPS      │   JWT, Idempotency-Key      │  auth · attendance ·      │
│  SQLite outbox       │ ◀────────────────────────── │  corrections · admin ·    │
│  WorkManager jobs    │                             │  reports · audit · jobs   │
└──────────────────────┘                             └─────────────┬─────────────┘
                                                                   │ Prisma
┌──────────────────────┐        HTTPS / JSON                       ▼
│  Admin web (React)   │ ──────────────────────────▶      ┌─────────────────┐
│  dashboard · maps    │                                  │  PostgreSQL 16  │
└──────────────────────┘                                  └─────────────────┘

        All three use @attendance/shared: location classifier, decision engine,
        zod API schemas and Asia/Bangkok time helpers (one implementation, no drift).
```

**Attendance flow (check-in example)**
1. The phone registers one geofence region per campus area from the current configuration.
2. Android reports **ENTER**. The app creates a pending check-in request, sends it to the API (or queues it offline) and posts a notification.
3. If the staff member taps **Check in**, the phone takes a fresh fix and sends it. The API approves the check-in if the fix is inside, fresh and not a mock location.
4. If they don't answer, a WorkManager job wakes the app when the grace period ends. It takes a fresh fix and auto-confirms only if the fix is **confirmed inside**.
   - If the fix is uncertain, it retries.
   - If the phone has left the area, the request is cancelled.
5. The server re-classifies the evidence and records the session; the server's decision is final.

---

## Requirements

| Tool | Version | Needed for |
|---|---|---|
| [Node.js](https://nodejs.org/) | **22 or newer** (tested on 24) | everything |
| [pnpm](https://pnpm.io/installation) | **10 or newer** (repo pins 12.15) | everything: `corepack enable` or `npm i -g pnpm` |
| Git | any recent | cloning |
| PostgreSQL 16 | via Docker **or** the embedded one (`pnpm --filter api db:local`) | API |
| Docker Desktop | optional | Postgres and Mailpit containers |
| [Android Studio](https://developer.android.com/studio) | recent, with **Android SDK 36**, platform tools, an emulator image **with Google Play**, and **CMake 3.31.x** (on Windows) | mobile app |
| JDK | **17** (bundled with Android Studio) | mobile app |
| Google Maps API keys | optional | real map tiles; without keys both apps show a built-in fallback |

The mobile app needs Android 8.0 (API 26) or newer. It is an Expo **development build**, so it doesn't run in Expo Go.

---

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/biggasoftware/Attendance_Check.git
cd Attendance_Check
pnpm install
pnpm --filter @attendance/shared build
```

### 2. Start the database

Choose **one** of the two options.

**Option A: Docker**
```bash
pnpm db:up            # PostgreSQL on :5432, Mailpit (catches emails) at http://localhost:8025
```

**Option B: no Docker (embedded PostgreSQL)**
```bash
pnpm --filter api db:local    # PostgreSQL on :5433, data in apps/api/.local-pg. Keep this terminal open.
```

### 3. Configure and start the API (new terminal)

```bash
cp apps/api/.env.example apps/api/.env
```

If you used option B, edit `apps/api/.env`:
- change `DATABASE_URL` to port `5433`
- set `SMTP_HOST=` to empty (emails are then printed in the API log)

Then migrate, seed and start the API:
```bash
pnpm --filter api db:migrate
pnpm --filter api db:seed
pnpm --filter api dev
```

- API: http://localhost:3000/api/v1
- Swagger docs: http://localhost:3000/api/v1/docs

### 4. Start the admin web (new terminal)

```bash
pnpm --filter admin-web dev   # http://localhost:5173 (proxies /api to :3000)
```

### 5. Run the Android app (new terminal)

Start an Android emulator from Android Studio's Device Manager first. Then, from the repo root:

```bash
pnpm android
```

This builds the native app, installs it on the emulator and starts Metro. After the first build you only need Metro:

```bash
pnpm mobile:start             # then open the app on the emulator
```

The emulator reaches the API on your computer at `http://10.0.2.2:3000/api/v1` (the default). For a real phone on the same Wi-Fi, set `EXPO_PUBLIC_API_URL` (see [Configuration](#configuration)).

### Seed accounts (development only)

| Email | Password | Role | Use in |
|---|---|---|---|
| `staff@siit.tu.ac.th` | `Staff1234` | Staff | mobile app |
| `staff2@siit.tu.ac.th` | `Staff1234` | Staff | mobile app |
| `attendance.admin@siit.tu.ac.th` | `Admin1234` | Attendance Admin | admin web |
| `system.admin@siit.tu.ac.th` | `Admin1234` | System Admin | admin web |

The seed creates geofence v1 "SIIT campuses" with two areas, each with a radius of 150 m:

| Area | Centre |
|---|---|
| SIIT Rangsit campus | 14.06935, 100.60776 |
| SIIT Bangkadi campus | 13.980481, 100.554870 |

The other seeded values: grace period 300 s, maximum reading age 60 s, maximum accuracy 30 m.

### Root commands

```bash
pnpm build          # build all packages (turbo)
pnpm typecheck      # typecheck all packages
pnpm test           # run all test suites
pnpm db:up / db:down  # Docker database and Mailpit
```

---

## Configuration

Copy each `.env.example` and fill it in. **Real `.env` and `.env.local` files are git-ignored; never commit secrets or API keys.**

### `apps/api/.env`

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://attendance:attendance@localhost:5432/attendance` | PostgreSQL connection |
| `JWT_SECRET` | dev value | **at least 32 random characters in production** |
| `JWT_ACCESS_TTL_SEC` / `REFRESH_TOKEN_TTL_DAYS` | `900` / `30` | token lifetimes |
| `CORS_ORIGINS` | `http://localhost:5173` | admin web origin(s), comma separated |
| `APP_LINK_BASE` | `http://localhost:5173` | base URL for activation and reset links in emails |
| `SMTP_HOST` / `SMTP_PORT` / `MAIL_FROM` | Mailpit | empty `SMTP_HOST` prints emails to the log instead |
| `EVIDENCE_RETENTION_DAYS` | `365` | how long location evidence is kept |
| `ENABLE_JOBS` | `true` | scheduled jobs |
| `SIGNUP_ENABLED` | `true` | staff self sign-up from the mobile app |
| `SIGNUP_EMAIL_DOMAINS` | empty (any) | comma-separated email domains allowed to sign up, e.g. `siit.tu.ac.th` |
| `ALLOW_MOCK_LOCATION` | `false` | emulator GPS testing only; the API refuses to start with it in production |

### `apps/admin-web/.env.local`

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | API base URL; leave unset in development (Vite proxies `/api`) |
| `VITE_GOOGLE_MAPS_API_KEY` | Maps JavaScript API key, restricted by HTTP referrer; empty uses the SVG map |

### `apps/mobile/.env.local`

| Variable | Purpose |
|---|---|
| `GOOGLE_MAPS_ANDROID_KEY` | Maps SDK for Android key, restricted to package `th.ac.siit.attendance` and your SHA-1. The key is compiled into the app, so after changing it run `npx expo prebuild --platform android` and rebuild. |
| `EXPO_PUBLIC_API_URL` | API URL for a real phone, e.g. `http://192.168.1.20:3000/api/v1` |
| `APP_VARIANT` | `production` forbids `http://` API URLs and cleartext traffic |

---

## Testing

```bash
pnpm test                          # everything
pnpm --filter @attendance/shared test
pnpm --filter api test             # e2e against a real PostgreSQL (embedded automatically, or TEST_DATABASE_URL)
pnpm --filter admin-web test
pnpm --filter mobile test          # Jest with fakes; no device needed
```

All 253 tests pass:

| Package | Tests |
|---|---|
| shared | 56 |
| api | 46 |
| admin-web | 33 |
| mobile | 118 |

The functional scenarios in design DS2 §3.6 are covered by tests named after them.

**Emulator walk-through:** import [`apps/mobile/testing/siit-boundary-crossing.gpx`](apps/mobile/testing/siit-boundary-crossing.gpx) in the emulator's Extended controls → Location → Routes. The route walks into the Rangsit geofence, stays, then walks out. It exercises the entry notification, the automatic check-in, the exit and the automatic check-out.
- Set `ALLOW_MOCK_LOCATION=true` in `apps/api/.env`; otherwise the API rejects emulator locations as mock.
- Grant the app location access **all the time**.

---

## Project structure

```
.
├── packages/shared/          location classifier, decision engine, zod API schemas, time helpers
├── apps/api/                 NestJS backend
│   ├── prisma/               schema, migrations, seed
│   ├── src/                  auth, users, attendance, corrections, geofence, admin, audit, jobs, mail
│   └── test/                 e2e tests (real PostgreSQL)
├── apps/admin-web/           React admin dashboard
│   └── src/                  pages, components/map, api, auth, i18n (en, th)
├── apps/mobile/              Expo / React Native Android app
│   ├── src/domain/           pure use cases (geofence transition, auto attendance, sync, auth)
│   ├── src/data/             API client, SQLite store and migrations, secure token storage
│   ├── src/services/         location, notifications, scheduler, background tasks
│   ├── src/features/         screens: auth, onboarding, dashboard, location map, history, correction, settings
│   ├── src/i18n/             en and th resources, Thai date formatting
│   ├── modules/attendance-scheduler/   Kotlin Expo module (WorkManager, headless service, boot receiver)
│   └── __tests__/            Jest tests with in-memory fakes
├── docs/                     API.md, i18n.md
├── docker-compose.yml        PostgreSQL, Mailpit, optional API container
└── Android_Mobile_Architecture.md   full design document
```

---

## Technical details

**Location classification** (`packages/shared/src/domain/locationClassifier.ts`)
- For each area, with distance *d* to the centre, GPS accuracy *a* and radius *r*:
  - **confirmed inside** if d + a ≤ r
  - **confirmed outside** if d − a > r
  - otherwise **uncertain**
- With several areas, a fix is inside if it is inside any area, and outside only if it is outside every area.
- Readings that are stale, too inaccurate or mocked are never accepted as evidence.

**Trust model**
- The phone proposes; the server decides.
- The API re-classifies every piece of evidence against the configuration version the request was created under, and checks freshness against **server** time.

**Reliability**
- Every action carries a client-generated request ID and an `Idempotency-Key`, and the server takes row locks, so retries after a lost response don't duplicate records.
- The mobile outbox replays in order, with exponential backoff.
- Grace-period jobs survive app kills and reboots: WorkManager starts a Headless JS task, and a boot receiver re-schedules jobs.

**Geofence versions**
- Every configuration change creates a new version, with a mandatory reason and an audit entry.
- The phone registers regions `faculty-v{n}` and `faculty-v{n}-z{k}`, so an event is always tied to the version it was created under.

**Security**
- argon2id passwords, short-lived JWTs and rotating refresh tokens (reuse revokes the token family), and lockout after failed sign-ins.
- Helmet and a rate limiter on the API.
- Tokens on the phone live in `expo-secure-store`; production builds are HTTPS-only.

**Privacy**
- The live map position never leaves the phone.
- Only the evidence attached to a check-in/out is uploaded, and it is deleted after `EVIDENCE_RETENTION_DAYS`.

**Time**
- Everything is stored and sent as UTC ISO-8601 and displayed in Asia/Bangkok.
- In Thai, dates use the Buddhist Era year (2026 → 2569).

**Languages**
- i18next with bundled resources; the English files are the contract, and a missing Thai key fails the typecheck. See [docs/i18n.md](docs/i18n.md).
- The mobile app follows the phone language; the choice in Settings is stored locally so background notifications use it too.
- The admin web follows the browser language and stores the choice in `localStorage`.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `EADDRINUSE :::3000` | An old API process is still running. Stop it (`npx kill-port 3000`) and run `pnpm --filter api dev` again. |
| Android build fails on Windows with *"Filename longer than 260 characters"* | Install **CMake 3.31.x** (Android Studio → SDK Manager → SDK Tools). Then put `sdk.dir=…/Android/Sdk` and `cmake.dir=…/Android/Sdk/cmake/3.31.6` in `apps/mobile/android/local.properties`. Re-add these after every `expo prebuild`, because prebuild regenerates `android/`. |
| `Unable to resolve module …` or a blank screen in the app | Restart Metro with a clean cache: `cd apps/mobile && npx expo start --dev-client --clear` |
| The map is blank or shows *Authorization failure* | The Google Maps key is missing, a demo key or wrongly restricted. Check the package name and SHA-1 (Android) or the referrer (web), and that the right Maps API is enabled. |
| Emulator check-ins are rejected with `MOCK_LOCATION` | Set `ALLOW_MOCK_LOCATION=true` in `apps/api/.env` (development only). |
| Geofence events arrive late on the emulator | Play Services batches location events. Open Google Maps on the emulator once, or wait a few minutes. |
| Install problems with React versions | Keep admin-web's `react` version equal to the mobile app's (both `19.3.0`); `nodeLinker: hoisted` needs a single hoisted copy. |

---

## Known limitations

- **Background behaviour on real devices** must be measured in field tests (DS2 scenario 15). This covers Doze, OEM battery killers and Headless JS start time. Turning off battery optimisation for the app helps.
- **iOS is not supported.** The app targets Android only.
- **Institutional single sign-on** is not integrated; accounts use email and password.
- **A manual confirmation queued offline** may not be approved after it syncs, because evidence must be fresh by server time. The app then falls back to a new evaluation or a correction request.
- **The API Docker image** (`apps/api/Dockerfile`) has not been built and tested.
- **The data retention period** (`EVIDENCE_RETENTION_DAYS`) must be agreed with the institution before deployment.
