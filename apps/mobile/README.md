# Staff mobile app (`apps/mobile`)

React Native + Expo **development build** (not Expo Go) for the geofencing attendance system.
Design: [`Android_Mobile_Architecture.md`](../../Android_Mobile_Architecture.md) §5–§12, §16. API contract: [`docs/API.md`](../../docs/API.md).

| | |
|---|---|
| Expo SDK | **58** (`expo@58.0.22`, React Native 0.88.1, React 19.3, New Architecture/Hermes). Versions come from `expo/bundledNativeModules.json`; `npx expo install --check` reports *up to date*. |
| Android package / scheme | `th.ac.siit.attendance` / `facultyattendance://` |
| Language | TypeScript strict (+ `noUncheckedIndexedAccess`) |
| Shared domain | `@attendance/shared` (classifier, decision engine, zod contract, Bangkok time helpers) — not re-implemented here |

## Commands

```bash
pnpm --filter mobile typecheck   # tsc --noEmit
pnpm --filter mobile test        # Jest (jest-expo preset), runs in Node with fakes – no device
pnpm --filter mobile start       # Metro for the dev client
```

## Environment variables

| Variable | Default | Used for |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://10.0.2.2:3000/api/v1` (emulator → host) | API base URL (inlined into the JS bundle) |
| `GOOGLE_MAPS_ANDROID_KEY` | *(unset)* | Maps SDK for Android key. Unset → the map screen shows a text fallback (no MapView is rendered, so the app does not crash on a missing key). Restrict the key to package `th.ac.siit.attendance` + SHA-1 (§16.6). Put it in `apps/mobile/.env.local` (see `.env.example`), then run `npx expo prebuild --platform android` and rebuild, because the key is compiled into the manifest. |
| `APP_VARIANT` | `development` | `production` forbids `http://` API URLs and disables cleartext. |

Put them in `apps/mobile/.env.local` (git-ignored) or EAS secrets.

**Cleartext HTTP**: `app.config.ts` sets `expo-build-properties → android.usesCleartextTraffic = true` **only** when `APP_VARIANT != production` and the API URL starts with `http://` (local backend on the emulator). Production builds keep Android's HTTPS-only default (§12.3).

## Creating the development build

Prerequisites: Android Studio (SDK 36 + an emulator image *with Google Play*), JDK 17, the backend running on the host (`pnpm --filter api dev`, see repo root).

```bash
cd apps/mobile
npx expo prebuild --platform android     # generates android/ (git-ignored), runs all config plugins
npx expo run:android                     # builds + installs the dev client, starts Metro
# or, in the cloud:
npx eas build --profile development --platform android   # needs an eas.json with a developmentClient profile
```

The local Expo module `modules/attendance-scheduler` is autolinked (Expo autolinking scans `./modules`).
Its config plugin (`modules/attendance-scheduler/app.plugin.js`) adds `FOREGROUND_SERVICE_LOCATION`, `RECEIVE_BOOT_COMPLETED`, the `location`-type foreground service and the boot receiver.

## Architecture (where things are)

```
index.ts                         registerRootComponent + TaskManager.defineTask(GEOFENCE_TASK)
                                 + AppRegistry.registerHeadlessTask(GracePeriodTask | SyncTask | BootTask)
src/domain/                      pure TS — ports.ts (injected deps), models.ts, errors.ts, displayStatus.ts
src/domain/useCases/             handleGeofenceTransition, evaluateAutoAttendance, confirmAttendance,
                                 syncOutbox, auth (login/logout/bootstrap), monitoring, submitCorrection
src/data/api/                    axios client (Bearer, single-flight refresh, Idempotency-Key) + zod-validated endpoints
src/data/db/                     expo-sqlite connection + migration runner (PRAGMA user_version)
src/data/repositories/           SqliteLocalStore (cache, outbox, evidence, event log)
src/data/secure/                 tokens in expo-secure-store
src/services/location|notifications|scheduler|background
src/app/                         App.tsx (providers, lifecycle), navigation, composition root (container.ts)
src/features/                    auth, onboarding (+permissions), dashboard, locationMap, history, correction, settings
src/store/                       zustand
modules/attendance-scheduler/    Expo module (Kotlin): WorkManager + HeadlessJsTaskService + BootReceiver
__tests__/                       Jest; fakes in __tests__/fakes (in-memory store, simulated backend)
```

Every entry point (UI, `GEOFENCE_TASK`, `GracePeriodTask`, `SyncTask`, `BootTask`) calls the same use cases through `getDeps()`; tests call them with fakes (`__tests__/fakes/makeDeps.ts`).

**Local DB choice**: plain typed SQL on `expo-sqlite` with a tiny migration runner (not Drizzle). Tables: `config_cache`, `attendance_request`, `location_evidence`, `outbox_entry`, `session_cache`, `event_log`, `meta`. The UI refreshes through a small change bus (`src/utils/events.ts`) instead of Drizzle's `useLiveQuery`.

## Testing on the emulator with mock locations

1. Start the backend (seed geofence v1: SIIT Rangsit `14.0693, 100.6035`, radius 150 m, grace 300 s) and sign in as `staff@siit.tu.ac.th` / `Staff1234`.
2. Complete the permission screen: notifications → precise location → **Allow all the time** → battery "Unrestricted".
3. Emulator → *Extended controls* (⋯) → **Location** → *Routes* → *Import GPX/KML* → `testing/siit-boundary-crossing.gpx` → play (speed 1×).
   The route walks in from 400 m south, stays 7 min, walks out 400 m north and stays 7 min, so it exercises
   ENTER → notification → (no tap) → grace job → fresh fix → **automatic check-in**, then EXIT → **automatic check-out**.
   Tap *Check In* on the notification instead to test the manual path; play a short in-and-out segment to test cancellation.
4. Geofence events may be delayed by minutes on emulators (Play Services batching). Opening Google Maps once on the emulator helps the fused provider start.
5. Evaluate: *Settings → Evaluation log → Requests CSV / Events CSV / JSON* (every §8.3 timestamp, device, config version, distance, classification).
6. `adb shell cmd jobscheduler run -f th.ac.siit.attendance <job-id>` or `adb shell dumpsys jobscheduler | grep attendance` helps inspecting WorkManager jobs; reboot the emulator to test `BootTask`.

Mock locations are reported as `isMock = true` and the backend rejects them (`REJECTED / MOCK_LOCATION`) — use a backend flag/dev seed if you need the emulator route to be *accepted* end-to-end.

## Test coverage (Jest, `__tests__/`)

| File | DS2 scenarios |
|---|---|
| `handleGeofenceTransition.test.ts` | #1/#2 entry → request, #4/#5 exit → request, ignore no-change transitions, #3 cancel on confirmed exit, #6 cancel on confirmed return, #7 keep when uncertain, #11 409 no open session, #13 notification failure, #14 offline outbox, #20 config version from region |
| `evaluateAutoAttendance.test.ts` | #2 auto check-in, #5 auto check-out, timeout + outside → cancel, #7 uncertain ×3 → unresolved, #8 stale/low-accuracy then valid, location unavailable, #13 notification failed, #1/#10 already confirmed → skip, early fire → wait, 409 grace not expired, #14 offline → pending sync → synced, #20 original config version fetched |
| `confirmAttendance.test.ts` | #1 manual check-in, #4 manual check-out, client not-confirmed + retry, server 422, #14 offline pending sync, #10 race (stored result), mock location rejected, location unavailable |
| `syncOutbox.test.ts` | create-before-action ordering, #9 idempotent replay after lost response, exponential backoff + per-request blocking, offline stop, #11 409 on queued create, 409 grace-not-expired retry, 422 on queued confirm re-arms the grace job, single-flight |
| `auth.test.ts` | STAFF login → monitoring, non-STAFF → Admin Web, error mapping, #12 missing background permission, missing notifications, #19 logout with open session (warning, no auto check-out, cancel jobs, clear tokens), bootstrap re-registers on config change + re-schedules jobs, revoked refresh token, offline bootstrap |
| `apiClient.test.ts` | single-flight refresh for concurrent 401s, refresh rejected → sign-out, Idempotency-Key + ApiError mapping, zod contract rejection, network error |
| `misc.test.ts` | five display statuses, migration runner, CSV export, config plugin manifest changes |

## Not implemented / not verifiable here

- **Kotlin module is uncompiled.** This machine has no Android SDK, so `modules/attendance-scheduler/android` (WorkManager worker, `HeadlessJsTaskService`, `BootReceiver`) has never been built or run. JS falls back to a no-op + warning when the native module is missing.
- No APK was built; `npx expo prebuild` / Gradle were not run. `npx expo config` (plugins resolve, manifest entries present) and `npx expo export --platform android` (Metro → Hermes bundle) succeed.
- Background behaviour (Doze, OEM killers, Headless JS start time, Android 12+ foreground-service start restrictions from WorkManager) is only verifiable on devices (DS2 #15). If Android refuses the foreground-service start, the worker retries up to 5 times; disabling battery optimisation exempts the app.
- The `Dismiss` button is handled when the app process is alive; if the app was killed, the dismiss event is not logged (it never cancels anything, so behaviour is still correct).
- Manual check-in without a geofence event (e.g. a missed ENTER) is not offered; the user files a correction request.
- `transform-remove-console`, R8/ProGuard and EAS profiles (`eas.json`) are not set up.
- Component tests (React Native Testing Library), Maestro E2E and the `work-testing` instrumented tests from design §14 are not written.
- Battery-optimisation status cannot be read through Expo APIs; the permission screen links to the system setting instead of showing a status.
