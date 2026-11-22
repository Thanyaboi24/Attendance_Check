# SIIT Faculty Attendance: server installation

This package runs the admin website and the API at **https://siitatt.bsoftsolutions.net** with Docker.
Everything is prebuilt, so the server needs only Docker; no Node.js, pnpm or source code.

| Address | What |
|---|---|
| `https://siitatt.bsoftsolutions.net/` | Admin website |
| `https://siitatt.bsoftsolutions.net/api/v1` | API (the mobile app's server address) |

Three containers run: `web` (Caddy: HTTPS and the website), `api` and `postgres`. Only `web` is reachable from outside.

## Requirements

- A Linux server (Ubuntu 22.04 or 24.04, Debian 12 or similar) with 2 GB RAM and 10 GB disk.
- **Docker Engine** with the **Compose plugin**. On Ubuntu or Debian: `curl -fsSL https://get.docker.com | sudo sh`
- **DNS:** an `A` record for `siitatt.bsoftsolutions.net` pointing to the server's public IP.
- **Firewall:** ports **80** and **443** (TCP, and UDP 443 for HTTP/3) open to the internet. The HTTPS certificate is issued through them.
- Internet access during installation. Docker downloads base images and npm packages.

## Install

```bash
# Copy the package to the server, e.g. from your PC:
#   scp siitatt-server-<version>.tar.gz user@server:~
tar -xzf siitatt-server-<version>.tar.gz      # or: unzip siitatt-server-<version>.zip
cd siitatt-server-<version>
sudo sh install.sh you@siit.tu.ac.th          # the email receives certificate notices
```

`install.sh` does the following:
1. Creates `.env` with a random database password and token secret.
2. Builds the two images and starts the three containers.
3. Waits until the API is healthy.

The first run takes a few minutes. The HTTPS certificate is issued automatically within a minute after that.

Check it:

```bash
curl https://siitatt.bsoftsolutions.net/api/v1/health      # → {"status":"ok",...}
```

### Email (recommended)

Activation and password-reset emails need an SMTP account. Fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` in `.env`, then run `sudo sh install.sh` again.

### First administrator

The new database is empty, with no default accounts. Create the first System Administrator:

```bash
sudo sh create-admin.sh --email you@siit.tu.ac.th --name "Your Name" --staff-id A0001
```

It prints a one-time link (valid 24 hours). Open it to set the password, then sign in at https://siitatt.bsoftsolutions.net. Add other staff on the website.

## Daily operation

| Task | Command (in the package folder) |
|---|---|
| Status | `sudo docker compose ps` |
| Logs | `sudo docker compose logs -f web api` |
| Restart | `sudo docker compose restart` |
| Stop / start | `sudo docker compose down` / `sudo docker compose up -d` |
| Backup database | `sudo sh backup.sh` (writes `backups/*.sql.gz`; copy them off the server) |

`docker compose down` keeps the data. **Never run `docker compose down -v`**: it deletes the database and the certificates.

## Updating to a new package

```bash
tar -xzf siitatt-server-<new>.tar.gz
cp siitatt-server-<old>/.env siitatt-server-<new>/.env     # keep the same secrets
cd siitatt-server-<new> && sudo sh backup.sh 2>/dev/null; sudo sh install.sh
```

The project name in `docker-compose.yml` is the same in every version, so the new containers keep the existing database and certificate. The API applies new database migrations when it starts.

## Troubleshooting

- **Site doesn't open or shows a certificate error.** Run `sudo docker compose logs web`.
  - The usual cause is DNS that doesn't point to this server yet.
  - The other usual cause is port 80 or 443 being blocked, by a cloud firewall or by another web server such as Apache or nginx on the same machine.
  - Caddy retries automatically.
- **Port 80/443 already in use.** Another web server is running. Stop it, or put it in front of this one.
- **API unhealthy.** Run `sudo docker compose logs api`. "Invalid environment configuration" names the `.env` value to fix.
