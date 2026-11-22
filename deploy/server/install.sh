#!/bin/sh
# Installs (or updates) the SIIT Faculty Attendance server with Docker.
#
#   sh install.sh                       # asks for the certificate email the first time
#   sh install.sh admin@siit.tu.ac.th   # same, without the question
#
# Safe to run again: an existing .env is kept, and the database is never reset.
set -eu
cd "$(dirname "$0")"

say() { printf '\n\033[1;35m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mError: %s\033[0m\n' "$1" >&2; exit 1; }

# --- Docker -------------------------------------------------------------------
command -v docker >/dev/null 2>&1 || fail "Docker is not installed. See https://docs.docker.com/engine/install/"
docker info >/dev/null 2>&1 || fail "Docker is not running, or this user may not use it (try: sudo sh install.sh)."
docker compose version >/dev/null 2>&1 || fail "The Docker Compose plugin is missing (package docker-compose-plugin)."

# --- Settings -----------------------------------------------------------------
random_secret() {
  # Letters and digits only, so the value is safe inside the database URL.
  LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"
}
get_value() { sed -n "s/^$1=//p" .env | tail -n 1; }
set_value() {
  # $2 never contains | or & (secrets are alphanumeric; emails are checked below).
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else printf '%s=%s\n' "$1" "$2" >>.env; fi
}

if [ ! -f .env ]; then
  say "Creating .env with new random secrets"
  cp .env.example .env
  chmod 600 .env
fi
[ -n "$(get_value POSTGRES_PASSWORD)" ] || set_value POSTGRES_PASSWORD "$(random_secret 32)"
[ -n "$(get_value JWT_SECRET)" ] || set_value JWT_SECRET "$(random_secret 64)"

email="$(get_value ACME_EMAIL)"
if [ -z "$email" ]; then
  email="${1:-}"
  if [ -z "$email" ] && [ -t 0 ]; then
    printf 'Email for HTTPS certificate notices (Let'"'"'s Encrypt): '
    read -r email
  fi
  case "$email" in
    *@*.*) ;;
    *) fail "A valid email is needed for the HTTPS certificate: sh install.sh you@example.com" ;;
  esac
  case "$email" in *'|'* | *'&'* | *' '*) fail "That email contains characters that are not allowed." ;; esac
  set_value ACME_EMAIL "$email"
fi

domain="$(get_value DOMAIN)"
[ -n "$domain" ] || domain=siitatt.bsoftsolutions.net
version="$(cat VERSION 2>/dev/null || echo latest)"
set_value APP_VERSION "$version"

# --- DNS check (warning only) --------------------------------------------------
if command -v getent >/dev/null 2>&1; then
  ip="$(getent ahostsv4 "$domain" 2>/dev/null | awk 'NR==1{print $1}')"
  if [ -z "$ip" ]; then
    printf '\033[33mWarning: %s does not resolve yet. HTTPS will start working once its DNS A record points here.\033[0m\n' "$domain"
  else
    echo "$domain resolves to $ip (this must be this server's public IP)."
  fi
fi

# --- Build and start ----------------------------------------------------------
say "Building and starting version $version for https://$domain"
docker compose up -d --build --remove-orphans

say "Waiting for the API to become healthy"
i=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q api)" 2>/dev/null)" = healthy ]; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    docker compose logs --tail 50 api
    fail "The API did not start within 5 minutes (log above)."
  fi
  sleep 5
done
echo "API is healthy."

say "Installed"
cat <<EOF
  Admin website : https://$domain
  API (mobile)  : https://$domain/api/v1
  Logs          : docker compose logs -f web api

The HTTPS certificate is requested on the first visit; if the site does not open, check
"docker compose logs web" (DNS must point here and ports 80 and 443 must be open).

First install only: create the first administrator account
  sh create-admin.sh --email you@siit.tu.ac.th --name "Your Name" --staff-id A0001
EOF
