#!/bin/sh
set -e

# Vault Agent Injector renders /vault/secrets/db as KEY=VALUE pairs
# (see docs/plans/specs/2026-06-24-m12-k8s-scaffold-design.md §5).
# Skipped silently when absent (local docker-compose / dev without Vault).
if [ -f /vault/secrets/db ]; then
  set -a
  . /vault/secrets/db
  set +a
fi

exec "$@"
