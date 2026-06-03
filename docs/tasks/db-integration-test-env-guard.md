# Task: интеграционный тест @ccip/database падает при repo-wide прогоне (нет env-guard)

**ID:** TASK-2026-06-03-db-integration-test-env-guard
**Task Type:** Bug Fix / Test hardening (правит `packages/database/test`)
**Routing:** `ccip-dba` (lead) → T3
**Status:** open
**Raised:** 2026-06-03 (сессия M-08 design pass — всплыло при `pnpm test` из корня)

---

## Проблема

`packages/database/test/audit-log-rotation.test.ts` → тест `cron job audit-log-partman-maintenance is scheduled` падает при любом repo-wide прогоне (`pnpm test` из корня → turbo фанит по всем пакетам). У теста **нет env-guard'а**: он по дизайну рассчитан только на выделенное окружение, но запускается в любом sweep'е и падает там, где БД — не кастомный образ `ccip-postgres`.

## Доказательство

- Падающий ассерт: `SELECT … FROM cron.job WHERE jobname = 'audit-log-partman-maintenance'` → ожидает 1 строку, получает 0. Остальные 5 тестов (pg_partman/pg_cron extension, partman config, партиционирование) проходят — БД подключается, расширения есть.
- Миграция `0002_audit_log_partman` планирует job через `cron.schedule_in_database(...)`; метаданные pg_cron живут в «домашней» БД pg_cron, которая в ambient-Postgres ≠ БД, опрашиваемой тестом → 0 строк.
- CI-топология (`.github/workflows/ci.yml:106-108`) прямо документирует: *«migration 0002 requires pg_partman + pg_cron … @ccip/database integration tests run exclusively in the db-integration job»*. Общий test-job scoped: `pnpm turbo test --filter=@ccip/api`. БД-тесты идут только в job'е `db-integration` на образе `ccip-postgres` (pg_cron в `shared_preload_libraries`).

## Корень (by-design, не баг кода)

Тесты `@ccip/database` — environment-gated, но guard'а в самом тесте нет. CI обходит это **scoping'ом** (`--filter`), а локальный/наивный `turbo test` спотыкается. Не регрессия, к M-08 отношения не имеет.

## Предлагаемое направление

Добавить явный env-guard: `describe.skip` (или `test.skip`) для блока, если не выставлен флаг выделенного окружения (напр. `process.env.DB_INTEGRATION === '1'`). Флаг проставляет **только** CI-job `db-integration`. Тогда любой sweep вне этого окружения корректно пропускает тест, а CI по-прежнему его гоняет.

Альтернатива (отклонить, если ненадёжно): runtime-проба окружения вместо флага — но в ambient-БД миграция частично применяется (partman-конфиг есть), так что проба `shared_preload_libraries` неоднозначна; явный флаг чище.

## Acceptance Criteria

1. [ ] `pnpm test` из корня (repo-wide turbo) **не** падает на `@ccip/database`: env-gated тесты помечены skipped вне выделенного окружения.
2. [ ] CI-job `db-integration` выставляет флаг (`DB_INTEGRATION=1`) и по-прежнему **выполняет** интеграционные тесты (не skip) — проверить, что они реально прогоняются, а не молча пропущены.
3. [ ] Остальные 5 тестов сохраняют поведение; guard применяется к набору консистентно.
4. [ ] README/комментарий в тесте поясняет, что блок env-gated и как его запустить локально (см. `db-integration` job / образ `infra/docker/postgres`).

## Вне scope

- Сам механизм pg_cron cross-database job storage (не баг — особенность `schedule_in_database`).
- Изменение миграции 0002 или образа `ccip-postgres`.
- Запуск БД-тестов локально без Docker.

## Ссылки

- CI — `.github/workflows/ci.yml` (jobs `audit` + `db-integration`)
- Миграция — `packages/database/prisma/migrations/0002_audit_log_partman/migration.sql`
- Тест — `packages/database/test/audit-log-rotation.test.ts`
- Образ — `infra/docker/postgres`
