# admin-web — Administrator Web Dashboard (FR08, FR09)

React 19 + Vite 7 + TypeScript dashboard for Attendance Administrators (AA) and System Administrators (SA).
It consumes the backend contract in [`docs/API.md`](../../docs/API.md) and imports all DTO types, zod schemas,
Bangkok-time helpers and the location classifier from `@attendance/shared`.

## Run

```bash
pnpm install                          # from the repo root
pnpm --filter @attendance/shared build  # admin-web imports the shared package's dist/
pnpm --filter admin-web dev           # http://localhost:5173 (backend expected on http://localhost:3000)
pnpm --filter admin-web typecheck
pnpm --filter admin-web test          # Vitest + React Testing Library (fetch is mocked; no backend needed)
pnpm --filter admin-web build         # static files in apps/admin-web/dist
pnpm --filter admin-web preview
```

Dev accounts (seeded by the API): `attendance.admin@siit.tu.ac.th` / `Admin1234` (AA),
`system.admin@siit.tu.ac.th` / `Admin1234` (SA). Staff accounts are refused by this dashboard.

## Environment variables

Copy `.env.example` to `.env.local`.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `/api/v1` | Backend base URL. The default is relative; `vite dev` proxies `/api` → `http://localhost:3000`, so no CORS setup is needed in development. In production either serve the dashboard behind the same origin as the API or set the full URL (and allow the origin in the API's CORS config). |
| `VITE_GOOGLE_MAPS_API_KEY` | _(empty)_ | Google Maps JavaScript API key. When empty, every map falls back to a schematic SVG plot (in metres, north up) plus numeric lat/lng inputs, so all pages work without a key. |

### Google Maps key restrictions

Use a **separate key** for the admin web (not the Android key):

- **Application restriction:** *HTTP referrers (web sites)* — e.g. `http://localhost:5173/*` for development and
  `https://<admin-host>/*` for production.
- **API restriction:** *Maps JavaScript API* only (add *Places API* only if search is added later).
- Set a quota / budget alert in Google Cloud Console.

The key is embedded in the built JavaScript, so the referrer restriction is what protects it.

## Authentication

- Login with institutional email + password. Errors: generic “Invalid email or password.” (401), lockout message (423),
  inactive-account message (403 `ACCOUNT_INACTIVE`).
- A `STAFF` account is not let in: “This dashboard is for administrators; please use the mobile app.” (its refresh
  token is revoked immediately).
- Access token in memory only; refresh token in `sessionStorage` (survives reloads, cleared when the tab closes).
  Any 401 triggers a **single-flight** `/auth/refresh` shared by all concurrent requests, then the request is retried
  once; if refreshing fails the user is returned to the login page.
- Sign out calls `/auth/logout` to revoke the refresh token.
- Public pages linked from emails: `/activate?token=…` (24 h), `/reset-password?token=…` (30 min), plus
  `/forgot-password`. They show the password policy (≥ 8 characters, a letter and a digit).

## Pages per role

The UI hides what a role cannot use, but the backend enforces RBAC; 403 responses are shown as
“Your role does not have access…”.

| Page | AA | SA | Notes |
|---|:-:|:-:|---|
| Dashboard | ✓ | ✓ | Summary cards from `/admin/dashboard/summary` (refreshes every minute). |
| Attendance sessions | ✓ | | Date range, search, department, status filters, pagination. Method per action (Manual / Automatic / Corrected) and a “Corrected” badge. Edit dialog: times entered in Bangkok time, converted to UTC, mandatory reason → `PATCH`. |
| Attendance requests | ✓ | | Status filter (default **Unresolved**). Detail page: timeline, device, evidence table and a map with the geofence circle from the **request’s own config version** and evidence points + accuracy circles coloured by the server classification (green inside, red outside, amber uncertain). |
| Corrections | ✓ | | Pending queue (status filter). Approve (optionally adjusting the times) or reject; a note is always required. |
| Reports | ✓ | ✓ | `attendance.csv` (AA only, optional department) and `evaluation.csv` (AA + SA). Downloaded with the bearer token and saved as a blob. |
| Users | | ✓ | Search / role / status filters; create (sends activation email), edit name / department / role, activate / deactivate with confirmation, resend activation. |
| Geofence | read-only | ✓ | Current config + version history (view any version on the map). SA edit form: click the map (or drag the circle) to set the centre, radius via slider + number + draggable circle edge (1–1000 m, default 150 m), grace period and GPS thresholds, mandatory reason → `PUT` creates a new version. Pending requests keep their original version. |
| Audit log | ✓ | ✓ | Filter by entity type / action / entity id; expandable previous / new values JSON. |

All times are displayed in Asia/Bangkok using the shared helpers (`formatBangkokDateTime`, `bangkokLocalToIso`, …).

## Structure

```
src/
  api/client.ts           fetch wrapper: tokens, single-flight refresh, errors, CSV download
  auth/                   AuthContext (login/logout/session restore), role → navigation map
  components/             layout, route guards, UI primitives, map/ (Google Maps + SVG fallback)
  pages/                  one file per page (+ tests)
  test/                   Vitest setup and fetch-mock helpers
```
