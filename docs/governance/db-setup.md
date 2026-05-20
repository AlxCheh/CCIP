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

## Integration tests — `postgres_test` container

`apps/api/test/integration/*` требуют **отдельной** Postgres БД `ccip_test`. На
одной БД с dev (`ccip`) её поднять нельзя: pg_cron — per-database singleton,
бинд `cron.database_name` устанавливается в `00-cron-database.sh` при `initdb`
к значению `POSTGRES_DB` контейнера. Поэтому миграция `0002_audit_log_partman`
смогла бы создать `pg_cron` extension **только** в той БД, под именем которой
контейнер был инициализирован.

Решение: отдельный compose-сервис `postgres_test` (тот же T-22 image, своё
volume, port 5434), активируемый профилем `test` и инициализируемый с
`POSTGRES_DB=ccip_test`.

### One-time setup

```bash
docker compose -f infra/docker/docker-compose.yml --profile test up -d postgres_test
# Wait for healthy:
docker compose -f infra/docker/docker-compose.yml ps postgres_test
# Apply migrations:
DATABASE_URL=postgresql://ccip_owner:ccip_dev_pass@localhost:5434/ccip_test \
  pnpm --filter @ccip/database migrate:deploy
```

### Running the suite

```bash
pnpm --filter @ccip/api test:integration
```

`apps/api/test/integration/setup/env.ts` по умолчанию использует
`postgresql://ccip_owner:ccip_dev_pass@localhost:5434/ccip_test`. Для CI или
кастомного хоста переопределите `DATABASE_URL_TEST`.

### Stopping

```bash
docker compose -f infra/docker/docker-compose.yml --profile test stop postgres_test
# или полная очистка (drop volume):
docker compose -f infra/docker/docker-compose.yml --profile test down -v postgres_test
```
