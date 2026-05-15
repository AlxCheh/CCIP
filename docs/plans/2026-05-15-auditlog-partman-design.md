---
spec: 2026-05-15-auditlog-partman
status: Draft
owner: ccip-dba (primary), ccip-devops + ccip-security (co-agents)
related:
  - ADR-010 (audit-log-partitioning)
  - §10.5 T-22 (zero-drift-compliance-section10.md, line 2305)
---

# T-22 — AuditLog `pg_partman` + `pg_cron` operational setup (design)

## 1. Goal

Привести фактическую схему `audit_log` в соответствие с контрактом ADR-010 в части
партиционирования и доказать инвариант ротации (drop старой партиции не теряет
недавние данные) integration-тестом, запускаемым в CI.

## 2. Scope

**In scope:**

- Установка PostgreSQL extensions `pg_partman` (v5.x) и `pg_cron` (≥1.4) в образе
  postgres, используемом dev и CI.
- Prisma migration `0002_audit_log_partman` — `CREATE EXTENSION`, передача
  ownership default-партиции от placeholder'а к partman, регистрация в
  `partman.part_config` (monthly, premake=3), `cron.schedule_in_database`
  для ежедневного `partman.run_maintenance_proc()`.
- Кастомный postgres image: `infra/docker/postgres/Dockerfile` на базе
  `postgres:16-bookworm` + PGDG apt packages.
- `infra/docker/postgres/00-cron-database.sh` — initdb hook, биндит
  `cron.database_name` к `POSTGRES_DB` (нужно для разных db в dev/CI).
- Изменение `infra/docker/docker-compose.yml` — `postgres` сервис использует
  локальный build вместо `postgres:16-alpine`.
- Новый CI job `db-integration` в `.github/workflows/ci.yml` — собирает image,
  запускает контейнер, применяет миграции, прогоняет integration-тесты.
- Jest-инфраструктура в `packages/database` (отсутствует на текущий момент) и
  test file `test/audit-log-rotation.test.ts`.
- Pre-flight guard в migration: если `pg_cron` не в `shared_preload_libraries`,
  RAISE EXCEPTION с понятным HINT для разработчика.
- Документация one-time dev step (`docker compose down -v`).

**Out of scope (tracked separately):**

| Item | Tracking |
|---|---|
| `GET /admin/health/audit-log` endpoint | ADR-010 §«Health check» — отдельный backend ticket |
| Archive policy: `SET TABLESPACE archive_ts` для партиций >12 мес | ADR-010 §«Архивация» — отдельный DBA ticket |
| Prometheus alert на `audit_log_default > 0` | DevOps observability ticket |
| Production: ccip_owner ≠ superuser → CREATE EXTENSION под DB owner privileges | Pre-pilot ticket «DB roles hardening» |
| Grants `ccip_app` на `partman` / `cron` schemas в prod | В составе pre-pilot DB roles hardening |

## 3. Architecture overview

```
infra/docker/postgres/Dockerfile          NEW   FROM postgres:16-bookworm + PGDG partman/cron
infra/docker/postgres/00-cron-database.sh NEW   initdb hook: cron.database_name=$POSTGRES_DB
infra/docker/docker-compose.yml           EDIT  postgres: image: → build: ./postgres

packages/database/prisma/migrations/
  0002_audit_log_partman/migration.sql    NEW   guard + extensions + partman setup + cron job

packages/database/package.json            EDIT  +jest, ts-jest, @types/jest; "test": "jest --runInBand"
packages/database/test/audit-log-rotation.test.ts NEW  6 integration test cases

.github/workflows/ci.yml                  EDIT  add db-integration job (manual docker run)

docs/governance/db-setup.md               NEW   one-time `docker compose down -v` note
```

**Принципы:**

- Один source of truth для postgres image — `infra/docker/postgres/Dockerfile`.
  Dev (compose) и CI используют его одинаково.
- `pg_partman` и `pg_cron` — operational infrastructure, не Prisma-managed
  schema (нет `model` в `schema.prisma`). Миграция инициализирует, не описывает.
- Test → integration-only. Запуск только при наличии `DATABASE_URL` с реальным
  postgres'ом, содержащим extensions. В CI — отдельный job.

## 4. Component specs

### 4.1 Migration `packages/database/prisma/migrations/0002_audit_log_partman/migration.sql`

```sql
-- ADR-010 — Audit Log: pg_partman + pg_cron operational setup
-- Depends on: 0001_initial (audit_log PARTITION BY RANGE (performed_at) + audit_log_default placeholder)
-- §10.5 T-22 — closes ADR-010 schema contract

BEGIN;

-- ─── 0. Pre-flight guard ─────────────────────────────────────────────────────
-- Refuses to run on a postgres cluster that doesn't have pg_cron preloaded.
-- Catches stale local dev volumes; gives the developer a clear next step.
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
-- 0001_initial creates audit_log_default as a placeholder. pg_partman v5 owns
-- the default partition lifecycle; we hand it over cleanly.
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
-- run_maintenance_proc creates upcoming premake partitions per part_config.
-- Retention is NOT enabled here; archive policy is a separate ticket per ADR-010.
SELECT cron.schedule_in_database(
    job_name := 'audit-log-partman-maintenance',
    schedule := '0 3 * * *',
    command  := 'CALL partman.run_maintenance_proc()',
    database := current_database()
);

COMMIT;
```

### 4.2 `infra/docker/postgres/Dockerfile`

```dockerfile
# CCIP postgres image: postgres:16-bookworm + pg_partman 5.x + pg_cron 1.4+
# §10.5 T-22 — ADR-010 audit_log partitioning
FROM postgres:16-bookworm

# 1. Install extensions from PGDG apt
RUN set -ex; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        postgresql-16-partman \
        postgresql-16-cron; \
    rm -rf /var/lib/apt/lists/*

# 2. Bake pg_cron into shared_preload_libraries (BEFORE first postgres start)
RUN echo "shared_preload_libraries='pg_cron'" >> /usr/share/postgresql/postgresql.conf.sample

# 3. Bind cron.database_name to POSTGRES_DB at initdb time
COPY 00-cron-database.sh /docker-entrypoint-initdb.d/00-cron-database.sh
RUN chmod +x /docker-entrypoint-initdb.d/00-cron-database.sh

# 4. R-1 / R-2 build-time version assertions
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

### 4.3 `infra/docker/postgres/00-cron-database.sh`

```bash
#!/usr/bin/env bash
# Runs after initdb but before final postgres start.
# Binds cron.database_name to the POSTGRES_DB the container was created with.
set -euo pipefail
: "${POSTGRES_DB:?POSTGRES_DB env var required}"
echo "cron.database_name = '${POSTGRES_DB}'" >> "${PGDATA}/postgresql.conf"
echo "[ccip-postgres] cron.database_name bound to ${POSTGRES_DB}"
```

### 4.4 `infra/docker/docker-compose.yml` — postgres service edit

В сервисе `postgres` строка `image: postgres:16-alpine` удаляется и заменяется
на пару `build:` + локальный `image:` tag. Остальные ключи (`environment`,
`volumes`, `ports`, `networks`, `healthcheck`) не меняются:

```yaml
  postgres:
    build:
      context: ./postgres
    image: ccip-postgres:local
    # … environment / volumes / ports / networks / healthcheck — без изменений …
```

### 4.5 `packages/database/package.json` — additions

```json
{
  "scripts": {
    "test": "jest --runInBand"
  },
  "devDependencies": {
    "@types/jest": "^30.0.0",
    "jest": "^30.0.0",
    "ts-jest": "^29.2.5"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "testRegex": "test/.*\\.test\\.ts$",
    "testTimeout": 30000
  }
}
```

### 4.6 `packages/database/test/audit-log-rotation.test.ts`

6 test cases (fixture org колонки выведены из `schema.prisma`: `id`, `name`,
`slug` — остальное имеет defaults):

```ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const FIXTURE_ORG_ID = '00000000-0000-0000-0000-000000000001';

beforeAll(async () => {
  // Required NOT NULL fields without defaults in Organization (schema.prisma): id, name, slug.
  // Other columns have defaults (plan='starter', isActive=true, createdAt=now()).
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

  test('rotation: dropping an old partition does not affect data in current partition', async () => {
    await prisma.$executeRawUnsafe(`CALL partman.run_maintenance_proc()`);

    const probeRecordId = BigInt(Date.now());
    await prisma.$executeRawUnsafe(`
      INSERT INTO audit_log (table_name, record_id, action, performed_at, organization_id)
      VALUES ('partition_probe', ${probeRecordId}, 'insert', NOW(), '${FIXTURE_ORG_ID}'::uuid)`);

    const siblings = await prisma.$queryRaw<Array<{ partition_name: string }>>`
      SELECT partition_tablename AS partition_name
      FROM partman.show_partitions('public.audit_log')
      WHERE partition_tablename NOT LIKE '%default'
        AND partition_tablename != (
          SELECT partition_tablename FROM partman.show_partitions('public.audit_log')
          WHERE NOW() >= partition_range_start AND NOW() < partition_range_end
        )
      LIMIT 1`;
    expect(siblings.length).toBeGreaterThan(0);

    await prisma.$executeRawUnsafe(`DROP TABLE "${siblings[0].partition_name}"`);

    const survivors = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM audit_log
      WHERE table_name = 'partition_probe' AND record_id = ${probeRecordId}`;
    expect(Number(survivors[0].count)).toBe(1);

    await prisma.$executeRawUnsafe(`
      DELETE FROM audit_log WHERE table_name = 'partition_probe' AND record_id = ${probeRecordId}`);
  });
});
```

### 4.7 `.github/workflows/ci.yml` — new `db-integration` job

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
        with: { node-version: '20', cache: 'pnpm' }
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

### 4.8 `docs/governance/db-setup.md` (NEW) — one-time dev step

Короткая секция «Re-initialising postgres after pg_cron change»:

> Migration `0002_audit_log_partman` требует, чтобы кластер postgres был
> инициализирован с `shared_preload_libraries='pg_cron'`. Существующий dev
> volume `postgres_data` создан до этого изменения и НЕ подхватит новый
> параметр при простом перезапуске.
>
> One-time step:
>
> ```bash
> docker compose -f infra/docker/docker-compose.yml down -v
> docker compose -f infra/docker/docker-compose.yml up -d postgres
> pnpm --filter @ccip/database migrate:deploy
> ```
>
> Без этого migration упадёт с понятным `RAISE EXCEPTION` и HINT'ом.

## 5. Risks

| ID | Risk | Mitigation |
|---|---|---|
| R-1 | PGDG ставит pg_partman v4 (не v5) при будущем bump | Build-time assertion в `Dockerfile` step 4 + runtime test `expect(extversion).toMatch(/^5\./)` |
| R-2 | `cron.schedule_in_database` отсутствует в pg_cron <1.4 | Build-time assertion в `Dockerfile` step 4 |
| R-5 | Dev volume не подхватит `shared_preload_libraries` | Pre-flight guard в migration §4.1 § «0. Pre-flight guard» + doc note §4.8 |
| R-6 | partman v5 conflict с `audit_log_default` placeholder | Migration делает `DETACH` + `DROP` до `create_parent` |
| R-7 | Параллельные jest worker'ы → race на партициях | `jest --runInBand` + per-test `probeRecordId = BigInt(Date.now())` |

## 6. Notes (not risks)

- **Migration idempotency:** Prisma `_prisma_migrations` гарантирует, что 0002
  не выполнится дважды. `DROP TABLE audit_log_default` безопасно по этому
  контракту.
- **Default partition name:** после `create_parent(p_default_table=true)`
  partman v5 создаёт свою default-партицию (имя обычно `audit_log_default` или
  `audit_log_default_p`). Тесты используют `partman.show_partitions(...)`,
  не имя — устойчиво к изменению naming convention.
- **`--runInBand`** обязателен для этого пакета, потому что тесты используют
  destructive partition operations на shared DB. Это не временный workaround,
  а семантическое требование.

## 7. Success criteria

T-22 считается закрытым, когда выполнено всё перечисленное:

1. `docker build -t ccip-postgres-test ./infra/docker/postgres` — succeeds,
   печатает `OK — pg_partman=5.x, pg_cron=X.Y`.
2. `docker compose -f infra/docker/docker-compose.yml up -d postgres`
   (на чистом volume) — healthy.
3. `pnpm --filter @ccip/database migrate:deploy` — без ошибок, миграция
   0002 применяется.
4. `pnpm --filter @ccip/database test` — все 6 test cases green.
5. CI job `db-integration` — green на PR.
6. Существующий audit-suite 17/17 — остаётся green (никаких регрессий в
   `tools/audit/`).

## 8. Implementation order (для writing-plans skill)

1. Dockerfile + initdb script (Section 4.2, 4.3) — build assertion закроет R-1/R-2.
2. docker-compose edit (Section 4.4).
3. Migration SQL (Section 4.1).
4. Jest infrastructure в `packages/database` (Section 4.5).
5. Integration test (Section 4.6).
6. CI workflow edit (Section 4.7).
7. Doc note (Section 4.8).
8. CHANGELOG entry.

Каждый шаг — отдельный commit. Шаги 1–7 — primary agent `ccip-dba` с co-agent
`ccip-devops` на шаге 6 (CI workflow).

`security-reviewer` — параллельный co-agent (auto-trigger по risk:HIGH +
AuditLog touch, per CLAUDE.md §Auxiliary Agents). Он работает конкурентно
с реализацией шагов 1–7, не сериально после них. Verdict ожидается до merge.
При severity:critical — BLOCK, основной коммит не уходит до явного user OK.
