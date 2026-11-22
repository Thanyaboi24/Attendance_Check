#!/bin/sh
# Writes a compressed database backup to ./backups/attendance-YYYY-MM-DD-HHMM.sql.gz
#
# Restore into an empty database:
#   gunzip -c backups/<file>.sql.gz | docker compose exec -T postgres psql -U attendance -d attendance
set -eu
cd "$(dirname "$0")"
mkdir -p backups
file="backups/attendance-$(date +%F-%H%M).sql.gz"
docker compose exec -T postgres pg_dump -U attendance -d attendance | gzip >"$file"
echo "Backup written to $file"
