# AuditLog `pg_partman` + `pg_cron` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть §10.5 T-22: `audit_log` партиционируется через `pg_partman` v5 + `pg_cron` ≥1.4 в кастомном postgres image; rotation invariant (drop старой партиции не теряет recent данные) доказан integration-тестом в CI.

**Architecture:** Custom `infra/docker/postgres/Dockerfile` на базе `postgres:16-bookworm` + PGDG apt packages c build-time version assertions. Prisma migration `0002_audit_log_partman` устанавливает extensions, регистрирует partman parent (monthly, premake=3) и планирует daily `partman.run_maintenance_proc()` через pg_cron. Integration tests в `@ccip/database/test/` через jest на runtime DB в новом CI job `db-integration`.

**Tech Stack:** PostgreSQL 16 (bookworm), pg_partman 5.x, pg_cron ≥1.4, Prisma 5, Jest 30, ts-jest, GitHub Actions, Docker.

**Spec:** [`docs/plans/2026-05-15-auditlog-partman-design.md`](2026-05-15-auditlog-partman-design.md)

**Shell convention:** все команды ниже даны в bash-синтаксисе. На Windows-хосте есть два варианта:
1. **Git Bash / WSL** — копируй команды как есть.
2. **PowerShell** — для inline env-var используй `$env:DATABASE_URL='...'; pnpm ...`, `mkdir -p` → `New-Item -ItemType Directory -Force -Path ...`, `sleep 5` → `Start-Sleep -Seconds 5`. Циклы `for i in $(seq 1 30)` переписывай через `1..30 | ForEach-Object { ... }`.

CI выполняется на `ubuntu-latest` — bash-команды в `.github/workflows/ci.yml` НЕ требуют адаптации.

---

## File map

| File | Type | Responsibility |
|---|---|---|
| `infra/docker/postgres/Dockerfile` | NEW | Custom postgres image: pg_partman + pg_cron + version assertions |
| `infra/docker/postgres/00-cron-database.sh` | NEW | initdb hook: bind `cron.database_name` to `POSTGRES_DB` |
| `infra/docker/docker-compose.yml` | MODIFY | `postgres` service: `image:` → `build:` |
| `packages/database/package.json` | MODIFY | +jest, ts-jest, @types/jest devDeps + test script + jest config |
| `packages/database/test/audit-log-rotation.test.ts` | NEW | 6 integration test cases (extensions, structure, rotation) |
| `packages/database/prisma/migrations/0002_audit_log_partman/migration.sql` | NEW | Pre-flight guard + extensions + partman setup + cron job |
| `.github/workflows/ci.yml` | MODIFY | +`db-integration` job (manual `docker run` step) |
| `docs/governance/db-setup.md` | NEW | One-time dev step: `docker compose down -v` |
| `CHANGELOG.md` | MODIFY | T-22 entry |

---

## Pre-flight

Перед началом убедитесь:

- [ ] **0.1:** На `main`, working tree clean: `git status --short` → пустой вывод

  > Если working tree не пустой — на момент написания плана висят правки в
  > `docs/errors/errors_log.md` / `docs/errors/session-opt-index.md`. Решение
  > (commit/stash/discard) принимает оператор перед созданием feature-ветки;
  > план это не предписывает.

- [ ] **0.2:** Создать feature branch: `git checkout -b feat/t22-auditlog-partman`
- [ ] **0.3:** `pnpm install --frozen-lockfile` уже выполнен в этой сессии (для скорости последующих steps)
- [ ] **0.4:** Docker daemon работает: `docker info` → не падает
- [ ] **0.5:** Husky armed: проверка `git config core.hooksPath` → `.husky` (audit-suite на каждом коммите)

Если что-то из 0.1–0.5 не выполняется — остановитесь и зафиксируйте проблему перед началом Task 1.

---

## Task 1: Custom postgres image (Dockerfile + initdb hook)

**Files:**
- Create: `infra/docker/postgres/Dockerfile`
- Create: `infra/docker/postgres/00-cron-database.sh`

- [ ] **Step 1.1: Создать директорию**

```bash
mkdir -p infra/docker/postgres
```

- [ ] **Step 1.2: Написать `infra/docker/postgres/00-cron-database.sh`**

```bash
#!/usr/bin/env bash
# Runs after initdb but before final postgres start.
# Binds cron.database_name to the POSTGRES_DB the container was created with.
set -euo pipefail
: "${POSTGRES_DB:?POSTGRES_DB env var required}"
echo "cron.database_name = '${POSTGRES_DB}'" >> "${PGDATA}/postgresql.conf"
echo "[ccip-postgres] cron.database_name bound to ${POSTGRES_DB}"
```

- [ ] **Step 1.3: Написать `infra/docker/postgres/Dockerfile`**

```dockerfile
# CCIP postgres image: postgres:16-bookworm + pg_partman 5.x + pg_cron 1.4+
# §10.5 T-22 — ADR-010 audit_log partitioning
FROM postgres:16-bookworm

RUN set -ex; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        postgresql-16-partman \
        postgresql-16-cron; \
    rm -rf /var/lib/apt/lists/*

RUN echo "shared_preload_libraries='pg_cron'" >> /usr/share/postgresql/postgresql.conf.sample

COPY 00-cron-database.sh /docker-entrypoint-initdb.d/00-cron-database.sh
RUN chmod +x /docker-entrypoint-initdb.d/00-cron-database.sh

RUN set -ex; \
    PARTMAN_MAJOR=$(grep "^default_version" /usr/share/postgresql/16/extension/pg_partman.control \
                    | sed -E "s/.*'([0-9]+)\..*'/\1/"); \
    CRON_VER=$(grep "^default_version"      /usr/share/postgresql/16/extension/pg_cron.control \
               | sed -E "s/.*'([0-9]+\.[0-9]+).*'/\1/"); \
    test "$PARTMAN_MAJOR" = "5" \
        || { echo "FAIL R-1: pg_partman major must be 5, got $PARTMAN_MAJOR"; exit 1; }; \
    awk -v v="$CRON_VER" 'BEGIN { split(v,a,"."); exit !(a[1]>1 || (a[1]==1 && a[2]>=4)) }' \
        || { echo "FAIL R-2: pg_cron must be >=1.4, got $CRON_VER"; exit 1; }; \
    echo "OK — pg_partman=${PARTMAN_MAJOR}.x, pg_cron=${CRON_VER}"
```

- [ ] **Step 1.4: Билд image**

Run: `docker build -t ccip-postgres:local infra/docker/postgres`
Expected: успешный билд с финальной строкой stdout `OK — pg_partman=5.x, pg_cron=X.Y` (где X.Y ≥ 1.4).
Если assertion упал — открыть PGDG release notes, обновить версии в `apt-get install` (`postgresql-16-partman=5.*`) и пересобрать.

- [ ] **Step 1.5: Smoke run — pg_cron загружается**

```bash
docker run -d --rm --name pg_smoke \
  -e POSTGRES_DB=smoketest \
  -e POSTGRES_USER=smoke \
  -e POSTGRES_PASSWORD=smoke \
  ccip-postgres:local

# Подождать 5 сек (initdb)
sleep 5

docker exec pg_smoke psql -U smoke -d smoketest -c "SHOW shared_preload_libraries;"
```

Expected: `shared_preload_libraries` содержит `pg_cron`. Если нет — initdb hook не сработал, проверить `00-cron-database.sh` ownership/permissions.

- [ ] **Step 1.6: Smoke run — `cron.database_name` биндится**

```bash
docker exec pg_smoke psql -U smoke -d smoketest -c "SHOW cron.database_name;"
```

Expected: `smoketest`. Это подтверждает, что initdb hook записал значение в postgresql.conf и финальный старт его подхватил.

- [ ] **Step 1.7: Cleanup smoke container**

```bash
docker stop pg_smoke
```

- [ ] **Step 1.8: Commit**

```bash
git add infra/docker/postgres/
git commit -m "feat(infra): custom postgres image w/ pg_partman + pg_cron (T-22)"
```

Husky прогонит audit-suite. Если упадёт — зафиксировать проблему перед продолжением.

---

## Task 2: Update docker-compose to use custom image

**Files:**
- Modify: `infra/docker/docker-compose.yml` (postgres service block, lines ~20–40)

- [ ] **Step 2.1: Прочитать текущий postgres блок**

Run: `grep -n "image: postgres" infra/docker/docker-compose.yml`
Expected: одна строка `image: postgres:16-alpine`.

- [ ] **Step 2.2: Заменить image на build**

В `infra/docker/docker-compose.yml`, в сервисе `postgres`, заменить:

```yaml
    image: postgres:16-alpine
```

на:

```yaml
    build:
      context: ./postgres
    image: ccip-postgres:local
```

Остальные поля (`environment`, `volumes`, `ports`, `networks`, `healthcheck`) **не трогать**.

- [ ] **Step 2.3: Валидация compose**

Run: `docker compose -f infra/docker/docker-compose.yml config | grep -A 3 "postgres:"`
Expected: блок начинается с `postgres:`, содержит `build:` подблок и `image: ccip-postgres:local`. Никаких syntax warnings.

- [ ] **Step 2.4: Down старый volume + up с новым image**

```bash
docker compose -f infra/docker/docker-compose.yml down -v
docker compose -f infra/docker/docker-compose.yml up -d postgres
```

Expected: контейнер `ccip_postgres` healthy через ~15 сек.
Run: `docker compose -f infra/docker/docker-compose.yml ps postgres`

- [ ] **Step 2.5: Verify pg_cron loaded в основном dev контейнере**

```bash
docker exec ccip_postgres psql -U ccip_owner -d ccip -c "SHOW shared_preload_libraries;"
docker exec ccip_postgres psql -U ccip_owner -d ccip -c "SHOW cron.database_name;"
```

Expected: первое — `pg_cron` (или `'pg_cron'`); второе — `ccip`.

- [ ] **Step 2.6: Commit**

```bash
git add infra/docker/docker-compose.yml
git commit -m "feat(infra): dev compose uses ccip-postgres:local image (T-22)"
```

---

## Task 3: Jest infrastructure in `@ccip/database`

**Files:**
- Modify: `packages/database/package.json`

- [ ] **Step 3.1: Прочитать текущий package.json**

Run: `cat packages/database/package.json`
Запомнить текущий блок `"scripts"` и `"devDependencies"`.

- [ ] **Step 3.2: Добавить jest config, скрипт и devDeps**

Изменить `packages/database/package.json`:

В `"scripts"` добавить:
```json
    "test": "jest --runInBand"
```

В `"devDependencies"` добавить:
```json
    "@types/jest": "^30.0.0",
    "jest": "^30.0.0",
    "ts-jest": "^29.2.5"
```

В корень объекта добавить блок:
```json
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "testRegex": "test/.*\\.test\\.ts$",
    "testTimeout": 30000
  }
```

- [ ] **Step 3.3: pnpm install для подтягивания devDeps**

Run: `pnpm install`
Expected: lockfile обновляется; jest, ts-jest, @types/jest появляются в `pnpm-lock.yaml`.

- [ ] **Step 3.4: Проверить, что jest запускается (no tests yet)**

Run: `pnpm --filter @ccip/database test`
Expected: jest exit code 1 с `No tests found, exiting with code 1`. Это **ожидаемо** — конфиг работает, тестов нет.

Если jest падает с `Cannot find preset "ts-jest"` — проверить, что `ts-jest` действительно в devDependencies и pnpm install прошёл.

- [ ] **Step 3.5: Commit**

```bash
git add packages/database/package.json pnpm-lock.yaml
git commit -m "chore(database): add jest infrastructure for integration tests (T-22)"
```

---

## Task 4: Migration 0002 — extensions + partman + pg_cron

**Files:**
- Create: `packages/database/prisma/migrations/0002_audit_log_partman/migration.sql`

- [ ] **Step 4.1: Создать директорию миграции**

```bash
mkdir -p packages/database/prisma/migrations/0002_audit_log_partman
```

- [ ] **Step 4.2: Написать `migration.sql`**

Файл: `packages/database/prisma/migrations/0002_audit_log_partman/migration.sql`

```sql
-- ADR-010 — Audit Log: pg_partman + pg_cron operational setup
-- Depends on: 0001_initial (audit_log PARTITION BY RANGE (performed_at) + audit_log_default placeholder)
-- §10.5 T-22 — closes ADR-010 schema contract

BEGIN;

-- ─── 0. Pre-flight guard ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF current_setting('shared_preload_libraries', true) IS NULL
     OR position('pg_cron' IN current_setting('shared_preload_libraries')) = 0 THEN
    RAISE EXCEPTION 'pg_cron not in shared_preload_libraries'
    USING DETAIL = 'Postgres cluster was initialised without pg_cron preloaded.',
          HINT   = 'Local dev: `docker compose down -v && docker compose up -d postgres` to reinit. CI: rebuild ccip-postgres-test image.';
  END IF;
END $$;

-- ─── 1. Extensions ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_partman WITH SCHEMA partman;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── 2. Reset placeholder default ─────────────────────────────────────────────
ALTER TABLE audit_log DETACH PARTITION audit_log_default;
DROP TABLE audit_log_default;

-- ─── 3. Register partman-managed parent (ADR-010: monthly, premake=3) ─────────
SELECT partman.create_parent(
    p_parent_table          := 'public.audit_log',
    p_control               := 'performed_at',
    p_interval              := '1 month',
    p_default_table         := true,
    p_automatic_maintenance := 'on',
    p_premake               := 3
);

-- ─── 4. Daily maintenance via pg_cron (ADR-010) ───────────────────────────────
SELECT cron.schedule_in_database(
    job_name := 'audit-log-partman-maintenance',
    schedule := '0 3 * * *',
    command  := 'CALL partman.run_maintenance_proc()',
    database := current_database()
);

COMMIT;
```

- [ ] **Step 4.3: Применить миграцию к dev БД**

```bash
DATABASE_URL=postgresql://ccip_owner:ccip_dev_pass@localhost:5432/ccip \
  pnpm --filter @ccip/database migrate:deploy
```

Expected: `1 migration applied successfully` (или эквивалент). Никаких EXCEPTION'ов.

- [ ] **Step 4.4: Verify extensions installed**

```bash
docker exec ccip_postgres psql -U ccip_owner -d ccip -c \
  "SELECT extname, extversion FROM pg_extension WHERE extname IN ('pg_partman','pg_cron');"
```

Expected: 2 строки. `pg_partman` extversion начинается на `5.`. `pg_cron` extversion ≥ `1.4`.

- [ ] **Step 4.5: Verify partman.part_config**

```bash
docker exec ccip_postgres psql -U ccip_owner -d ccip -c \
  "SELECT parent_table, partition_interval, premake FROM partman.part_config WHERE parent_table = 'public.audit_log';"
```

Expected: одна строка: `public.audit_log | 1 mon | 3`.

- [ ] **Step 4.6: Verify cron job**

```bash
docker exec ccip_postgres psql -U ccip_owner -d ccip -c \
  "SELECT jobname, schedule, active, database FROM cron.job WHERE jobname = 'audit-log-partman-maintenance';"
```

Expected: одна строка: `audit-log-partman-maintenance | 0 3 * * * | t | ccip`.

- [ ] **Step 4.7: Verify pre-flight guard работает (negative test)**

Создать временный контейнер БЕЗ pg_cron preload и проверить, что migration падает с правильным error:

```bash
docker run -d --rm --name pg_negative \
  -e POSTGRES_DB=guardtest \
  -e POSTGRES_USER=ccip_owner \
  -e POSTGRES_PASSWORD=p \
  -p 15432:5432 \
  postgres:16-alpine

sleep 5

# Скопировать migration.sql и попробовать применить
docker cp packages/database/prisma/migrations/0002_audit_log_partman/migration.sql pg_negative:/tmp/m.sql
docker exec pg_negative psql -U ccip_owner -d guardtest -f /tmp/m.sql 2>&1 | grep -E "pg_cron not in shared_preload_libraries|HINT" || echo "GUARD DID NOT FIRE"

docker stop pg_negative
```

Expected: вывод содержит `pg_cron not in shared_preload_libraries` и `HINT: Local dev: docker compose down -v`.
Если выводится `GUARD DID NOT FIRE` — guard написан некорректно, исправить и повторить.

- [ ] **Step 4.8: Commit**

```bash
git add packages/database/prisma/migrations/0002_audit_log_partman/
git commit -m "feat(database): pg_partman + pg_cron migration for audit_log (ADR-010, T-22)"
```

---

## Task 5: Integration test — extensions + structure (5 tests)

**Files:**
- Create: `packages/database/test/audit-log-rotation.test.ts`

- [ ] **Step 5.1: Создать директорию test/**

```bash
mkdir -p packages/database/test
```

- [ ] **Step 5.2: Написать test file (первые 5 cases)**

Файл: `packages/database/test/audit-log-rotation.test.ts`

```ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const FIXTURE_ORG_ID = '00000000-0000-0000-0000-000000000001';

beforeAll(async () => {
  // Required NOT NULL fields without defaults in Organization: id, name, slug.
  await prisma.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, slug)
    VALUES ('${FIXTURE_ORG_ID}', 'partman-rotation-test', 'partman-rotation-test')
    ON CONFLICT (id) DO NOTHING`);
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DELETE FROM organizations WHERE id = '${FIXTURE_ORG_ID}'`);
  await prisma.$disconnect();
});

describe('AuditLog partitioning (ADR-010, §10.5 T-22)', () => {
  test('pg_partman extension exists and is v5.x', async () => {
    const rows = await prisma.$queryRaw<Array<{ extname: string; extversion: string }>>`
      SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_partman'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].extversion).toMatch(/^5\./);
  });

  test('pg_cron extension exists', async () => {
    const rows = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'pg_cron'`;
    expect(rows).toHaveLength(1);
  });

  test('audit_log is a partitioned table', async () => {
    const rows = await prisma.$queryRaw<Array<{ relkind: string }>>`
      SELECT relkind FROM pg_class WHERE relname = 'audit_log' AND relnamespace = 'public'::regnamespace`;
    expect(rows[0]?.relkind).toBe('p');
  });

  test('audit_log is registered in partman.part_config with monthly interval and premake=3', async () => {
    const rows = await prisma.$queryRaw<Array<{ partition_interval: string; premake: number }>>`
      SELECT partition_interval, premake
      FROM partman.part_config
      WHERE parent_table = 'public.audit_log'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].partition_interval).toBe('1 mon');
    expect(rows[0].premake).toBe(3);
  });

  test('cron job audit-log-partman-maintenance is scheduled', async () => {
    const rows = await prisma.$queryRaw<Array<{ jobname: string; schedule: string; active: boolean }>>`
      SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'audit-log-partman-maintenance'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].schedule).toBe('0 3 * * *');
    expect(rows[0].active).toBe(true);
  });
});
```

- [ ] **Step 5.3: Запустить тесты**

```bash
DATABASE_URL=postgresql://ccip_owner:ccip_dev_pass@localhost:5432/ccip \
  pnpm --filter @ccip/database test
```

Expected: 5 tests passed.

- [ ] **Step 5.4: Sanity check — deliberate break**

Временно изменить `'pg_partman'` на `'pg_partman_xyz'` в первом тесте, запустить — тест должен упасть. Вернуть обратно, запустить — снова 5 passed.

Это подтверждает, что тест реально читает БД (а не зелёный по совпадению).

- [ ] **Step 5.5: Commit**

```bash
git add packages/database/test/audit-log-rotation.test.ts
git commit -m "test(database): audit_log extensions + partman config invariants (T-22)"
```

---

## Task 6: Integration test — rotation case

**Files:**
- Modify: `packages/database/test/audit-log-rotation.test.ts`

- [ ] **Step 6.1: Добавить 6-й test case в конец `describe`**

В `packages/database/test/audit-log-rotation.test.ts`, после теста `cron job audit-log-partman-maintenance is scheduled` (но всё ещё внутри `describe`), добавить:

```ts
  test('rotation: dropping a non-current partition does not affect data in current partition', async () => {
    await prisma.$executeRawUnsafe(`CALL partman.run_maintenance_proc()`);

    const probeRecordId = BigInt(Date.now());
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO audit_log (table_name, record_id, action, performed_at, organization_id)
        VALUES ('partition_probe', ${probeRecordId}, 'insert', NOW(), '${FIXTURE_ORG_ID}'::uuid)`);

      // Pick the partition with the largest upper bound (furthest in the future).
      // pg_get_expr on relpartbound returns strings like:
      //   FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00')
      //   DEFAULT
      // String-sort by the rendered bound is chronologically correct for monthly partitions
      // (TO ('YYYY-MM-DD ...') sorts lexicographically == chronologically).
      const targets = await prisma.$queryRaw<Array<{ partition_name: string }>>`
        SELECT c.relname AS partition_name
        FROM pg_inherits i
        JOIN pg_class c ON c.oid = i.inhrelid
        WHERE i.inhparent = 'public.audit_log'::regclass
          AND pg_get_expr(c.relpartbound, c.oid) NOT LIKE '%DEFAULT%'
        ORDER BY pg_get_expr(c.relpartbound, c.oid) DESC
        LIMIT 1`;
      expect(targets.length).toBeGreaterThan(0);

      await prisma.$executeRawUnsafe(`DROP TABLE "${targets[0].partition_name}"`);

      const survivors = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM audit_log
        WHERE table_name = 'partition_probe' AND record_id = ${probeRecordId}`;
      expect(Number(survivors[0].count)).toBe(1);
    } finally {
      await prisma.$executeRawUnsafe(`
        DELETE FROM audit_log WHERE table_name = 'partition_probe' AND record_id = ${probeRecordId}`);
    }
  });
```

- [ ] **Step 6.2: Запустить тесты**

```bash
DATABASE_URL=postgresql://ccip_owner:ccip_dev_pass@localhost:5432/ccip \
  pnpm --filter @ccip/database test
```

Expected: 6 tests passed.

- [ ] **Step 6.3: Sanity check rotation test**

Временно изменить `expect(Number(survivors[0].count)).toBe(1);` на `.toBe(0);` — тест должен упасть. Вернуть `.toBe(1);`, перезапустить — 6 passed.

- [ ] **Step 6.4: Commit**

```bash
git add packages/database/test/audit-log-rotation.test.ts
git commit -m "test(database): audit_log partition rotation invariant (T-22)"
```

---

## Task 7: CI `db-integration` job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 7.1: Прочитать конец `jobs:` блока ci.yml**

Run: `grep -n "^  [a-z]" .github/workflows/ci.yml`
Чтобы понять текущую структуру (есть ли `audit:`, `ci:`).

- [ ] **Step 7.2: Добавить `db-integration` job**

В конец `jobs:` блока `.github/workflows/ci.yml` добавить:

```yaml
  db-integration:
    name: DB integration (pg_partman rotation)
    runs-on: ubuntu-latest
    needs: audit
    steps:
      - uses: actions/checkout@v4

      - name: Build ccip-postgres image
        run: docker build -t ccip-postgres-test ./infra/docker/postgres

      - name: Start postgres container
        run: |
          docker run -d --name pg \
            -e POSTGRES_DB=ccip_test \
            -e POSTGRES_USER=ccip_owner \
            -e POSTGRES_PASSWORD=ccip_test_pass \
            -p 5432:5432 \
            --health-cmd="pg_isready -U ccip_owner -d ccip_test" \
            --health-interval=5s --health-timeout=5s --health-retries=20 \
            ccip-postgres-test

      - name: Wait for postgres healthy
        run: |
          for i in $(seq 1 30); do
            s=$(docker inspect --format='{{.State.Health.Status}}' pg)
            [ "$s" = "healthy" ] && exit 0
            sleep 2
          done
          docker logs pg
          exit 1

      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile

      - name: Apply Prisma migrations
        run: pnpm --filter @ccip/database migrate:deploy
        env:
          DATABASE_URL: postgresql://ccip_owner:ccip_test_pass@localhost:5432/ccip_test

      - name: Run @ccip/database integration tests
        run: pnpm --filter @ccip/database test
        env:
          DATABASE_URL: postgresql://ccip_owner:ccip_test_pass@localhost:5432/ccip_test

      - name: Postgres logs (on failure)
        if: failure()
        run: docker logs pg
```

Indentation: новый job на том же уровне, что и `audit:` / `ci:` (2 spaces).

- [ ] **Step 7.3: Валидация YAML**

Run: `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/ci.yml','utf8'))"`
Expected: silent (no errors).

Если `js-yaml` не установлен — `pnpm install -w -D js-yaml` или валидация через python: `python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`.

- [ ] **Step 7.4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add db-integration job for pg_partman (T-22)"
```

---

## Task 8: Documentation — `docs/governance/db-setup.md`

**Files:**
- Create: `docs/governance/db-setup.md`

- [ ] **Step 8.1: Написать doc file**

Файл: `docs/governance/db-setup.md`

```markdown
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
```

- [ ] **Step 8.2: Commit**

```bash
git add docs/governance/db-setup.md
git commit -m "docs(governance): one-time db re-init step for T-22"
```

---

## Task 9: CHANGELOG entry

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 9.1: Прочитать топ CHANGELOG.md**

Run: `head -30 CHANGELOG.md`
Найти место для добавления (обычно под `## [Unreleased]` или последним dev-разделом).

- [ ] **Step 9.2: Добавить entry**

Под `## [Unreleased]` (или эквивалентный текущий dev-раздел) добавить:

```markdown
### Added
- `audit_log` partitioning через `pg_partman` v5 + `pg_cron` (ADR-010, §10.5 T-22):
  - custom postgres image `infra/docker/postgres/Dockerfile` (postgres:16-bookworm + PGDG partman/cron + build-time version assertions)
  - migration `0002_audit_log_partman` с pre-flight guard, monthly partitions, premake=3, daily `run_maintenance_proc`
  - integration test `packages/database/test/audit-log-rotation.test.ts` (6 cases)
  - CI job `db-integration` для запуска rotation regression на каждом PR
  - `docs/governance/db-setup.md` — one-time dev re-init step

### Changed
- `infra/docker/docker-compose.yml`: postgres service использует local build вместо `postgres:16-alpine`

closes T-22
```

- [ ] **Step 9.3: Commit**

```bash
git add CHANGELOG.md
git commit -m "chore(changelog): T-22 audit_log pg_partman setup"
```

---

## Task 10: Final verification & push

- [ ] **Step 10.1: Прогнать полный local audit-suite**

```bash
pnpm audit-suite
```

Expected: `17/17 green` (или сколько было до этого — без регрессий). Если упало — диагностировать и зафиксировать перед push.

- [ ] **Step 10.2: Прогнать typecheck**

```bash
pnpm typecheck
```

Expected: silent / no errors.

- [ ] **Step 10.3: Прогнать integration test ещё раз (cleanup-проверка)**

```bash
DATABASE_URL=postgresql://ccip_owner:ccip_dev_pass@localhost:5432/ccip \
  pnpm --filter @ccip/database test
```

Expected: 6 tests passed. Если что-то «протекло» из предыдущих запусков (например, fixture org не удалился) — `afterAll` должен это починить, но если нет — диагностировать.

- [ ] **Step 10.4: Push branch**

```bash
git push -u origin feat/t22-auditlog-partman
```

- [ ] **Step 10.5: Open PR via `gh`**

```bash
gh pr create --title "feat: T-22 audit_log pg_partman + pg_cron operational setup" \
  --body "$(cat <<'EOF'
## Summary
- Кастомный postgres image (pg_partman 5.x + pg_cron 1.4+) с build-time version assertions
- Migration `0002_audit_log_partman` (ADR-010): extensions + partman parent monthly/premake=3 + daily cron maintenance + pre-flight guard
- Integration test (6 cases) подтверждающий ADR-010 invariants и rotation behavior
- CI job `db-integration` гоняет rotation test на каждом PR
- Doc note для one-time dev re-init

## Test plan
- [ ] CI `audit` job green
- [ ] CI `ci` job green (no regressions)
- [ ] CI `db-integration` job green
- [ ] Local: `pnpm audit-suite` 17/17 green
- [ ] Local: `pnpm --filter @ccip/database test` 6/6 green
- [ ] Pre-flight guard fires on vanilla postgres (manual smoke)

Closes §10.5 T-22 — `docs/plans/2026-05-15-auditlog-partman-design.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

`security-reviewer` co-agent должен прогнаться автоматически на этом PR (per CLAUDE.md auto-trigger: AuditLog touch). Если verdict severity:critical — fix и push дополнительный commit.

- [ ] **Step 10.6: Verify CI всех 3 job'ов green перед merge**

Wait for `gh pr checks <pr#>` → все три job'а (`audit`, `ci`, `db-integration`) → green.

---

## Done criteria (повторяем §7 spec'а)

T-22 закрывается, когда:

1. `docker build -t ccip-postgres:local infra/docker/postgres` — succeeds, печатает `OK — pg_partman=5.x, pg_cron=X.Y`.
2. `docker compose -f infra/docker/docker-compose.yml up -d postgres` (на чистом volume) — healthy.
3. `pnpm --filter @ccip/database migrate:deploy` — без ошибок.
4. `pnpm --filter @ccip/database test` — все 6 test cases green.
5. CI job `db-integration` — green на PR.
6. Audit-suite 17/17 — green (никаких регрессий).

После merge — обновить state-memory `zero_drift_section10_state.md`: пометить T-22 как done, убрать из «Deferred».
