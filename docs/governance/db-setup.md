# Local Postgres re-initialisation

## When this applies

Если на dev-машине уже был запущен старый dev volume `postgres_data` (создан до
T-22), то после `git pull` миграция `0002_audit_log_partman` упадёт с
`RAISE EXCEPTION 'pg_cron not in shared_preload_libraries'`.

Это **ожидаемое поведение** — pre-flight guard защищает от тихого молчаливого
сбоя на stale кластере.

## One-time fix

```bash
docker compose -f infra/docker/docker-compose.yml down -v
docker compose -f infra/docker/docker-compose.yml up -d postgres
pnpm --filter @ccip/database migrate:deploy
```

После этого dev БД работает на новом `ccip-postgres:local` image с pg_partman и
pg_cron, и все последующие миграции применяются нормально.

## Why down -v is needed

`shared_preload_libraries` PostgreSQL читает один раз при `initdb` (создание
кластера). Существующий volume содержит уже инициализированный кластер без
pg_cron preload. Просто перезапуск контейнера НЕ меняет настройку — нужен
свежий `initdb` на пустом volume, отсюда `down -v`.

См. также: [ADR-010](../decisions/ADR-010-audit-log-partitioning.md), §10.5 T-22.
