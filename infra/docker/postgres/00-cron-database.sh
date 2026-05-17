#!/usr/bin/env bash
# Runs after initdb but before final postgres start.
# Binds cron.database_name to the POSTGRES_DB the container was created with.
set -euo pipefail
: "${POSTGRES_DB:?POSTGRES_DB env var required}"
echo "cron.database_name = '${POSTGRES_DB}'" >> "${PGDATA}/postgresql.conf"
echo "[ccip-postgres] cron.database_name bound to ${POSTGRES_DB}"
