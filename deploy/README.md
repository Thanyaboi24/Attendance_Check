# Production deployment: https://siitatt.bsoftsolutions.net

Production runs from a self-contained **installation package**. The server needs only Docker; no Node.js, pnpm or source code.

| URL | Served by |
|---|---|
| `https://siitatt.bsoftsolutions.net/` | Admin website (built into the `web` image, served by Caddy) |
| `https://siitatt.bsoftsolutions.net/api/v1/…` | NestJS API (proxied by Caddy; same origin, so no CORS setup) |
| `https://siitatt.bsoftsolutions.net/activate?token=…` | Email links (`APP_LINK_BASE`) |

The mobile app's production server address is `https://siitatt.bsoftsolutions.net/api/v1`.

## 1. Build the package (developer PC)

```bash
pnpm install
node deploy/make-package.mjs
# → release/siitatt-server-<version>/ , .zip and .tar.gz
```

The script does the following:
1. Builds `@attendance/shared`, the API and the admin website. The website uses the relative `/api/v1` and contains no Google Maps key.
2. Copies the prebuilt files into the package. It packs the shared package as a tarball and refreshes the pinned npm lockfile `deploy/server/api/package-lock.json`.
3. Refuses to package any `.env`, seed or Maps key.

To use Google Maps on the website, first make a Maps JavaScript API key restricted to the referrer `https://siitatt.bsoftsolutions.net/*`. Then run `PROD_GOOGLE_MAPS_API_KEY=<key> node deploy/make-package.mjs`.

## 2. Install on the server

Copy the `.tar.gz` to the server, then run:

```bash
tar -xzf siitatt-server-<version>.tar.gz && cd siitatt-server-<version>
sudo sh install.sh you@siit.tu.ac.th
sudo sh create-admin.sh --email you@siit.tu.ac.th --name "Your Name" --staff-id A0001
```

`INSTALL.md` in the package covers the requirements (DNS, ports 80 and 443), email, backups, updates and troubleshooting.

## Package contents (sources in `deploy/server/`)

| File | Purpose |
|---|---|
| `docker-compose.yml` | `web` (Caddy), `api`, `postgres`. Project name `siitatt`, so updates keep the data volumes. |
| `web/Dockerfile`, `web/Caddyfile` | Caddy with the admin website in `/srv/admin`. Automatic HTTPS; `/api/*` goes to `api:3000`. |
| `api/Dockerfile`, `api/package.json`, `api/package-lock.json` | Runtime image: prebuilt `dist/`, `npm ci --omit=dev`, `prisma generate`. Runs `prisma migrate deploy` on start. |
| `.env.example` | Settings. `install.sh` creates `.env` with random secrets. |
| `install.sh`, `create-admin.sh`, `backup.sh` | Install or update, first administrator, database backup. |

## Alternative: a server that already runs nginx

If ports 80 and 443 already belong to nginx:
1. Use `nginx/siitatt.bsoftsolutions.net.conf`.
2. Copy `web/dist` from the package to `/var/www/siitatt`.
3. Get the certificate with `certbot --nginx -d siitatt.bsoftsolutions.net`.
4. Run only `postgres` and `api`, with the API published on `127.0.0.1:3000`, using a `docker-compose.override.yml` like this:

   ```yaml
   services:
     api:
       ports: ['127.0.0.1:3000:3000']
   ```

   Then start it: `docker compose up -d --build postgres api`.

## Mobile app for production

```bash
cd apps/mobile
export APP_VARIANT=production EXPO_PUBLIC_API_URL="https://siitatt.bsoftsolutions.net/api/v1"
npx expo prebuild --platform android --no-install && cd android && ./gradlew assembleRelease
```

The production variant allows HTTPS only. Sign it with a real keystore before distributing it widely.
