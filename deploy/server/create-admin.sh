#!/bin/sh
# Creates an administrator account and prints a one-time link to set its password.
#
#   sh create-admin.sh --email you@siit.tu.ac.th --name "Your Name" --staff-id A0001 \
#     [--department "SIIT"] [--role SYSTEM_ADMIN|ATTENDANCE_ADMIN]
set -eu
cd "$(dirname "$0")"
exec docker compose exec -T api node dist/scripts/create-admin.js "$@"
