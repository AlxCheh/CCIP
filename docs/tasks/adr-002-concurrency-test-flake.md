# Task: ADR-002 period-concurrency property-test флейкует под CI-нагрузкой

**ID:** TASK-2026-06-22-adr-002-concurrency-test-flake
**Task Type:** Bug Fix / Test hardening (правит `apps/api/test/integration`)
**Routing:** `ccip-qa` (lead) → T3
**Status:** open
**Raised:** 2026-06-22 (post-merge проверка `api-integration` на main после M-11 W4 merge batch — PR #38/#9/#28)

---

## Проблема

`apps/api/test/integration/invariants/adr-002-period-concurrency.integration.spec.ts`, тест `N concurrent OpenPeriod → exactly 1 succeeds, others throw PERIOD_ALREADY_OPEN or PERIOD_LOCK_TIMEOUT` — нестабилен в `api-integration` workflow. Падает регулярно, но **с разной картиной симптома** при каждом прогоне:

1. `Transaction already closed: A commit cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5003 ms passed` — 3ms превышение жёсткого лимита.
2. `expect(fulfilled).toHaveLength(1)` — получено другое количество successfully-fulfilled промисов.
3. `expect(fulfilled).toHaveLength(1)` с `Received length: 0` — все N=5 конкурентных `openPeriod()` упали, ни один не прошёл.

Воспроизведено 3 раза подряд (PR #38 — 2 прогона, ручной `workflow_dispatch` на `main` после мержа — 1 прогон), каждый раз новая комбинация. Не входит в required status checks для `main` (`required_status_checks.contexts` не включает `api-integration`), поэтому не блокирует мерж — но снижает доверие к сигналу: реальная регрессия в advisory-lock логике может потеряться в шуме.

## Корень (вероятный)

`PeriodService.openPeriod` (`apps/api/src/modules/period/period.service.ts:50-52`):

```ts
return await this.prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(...)`;
  ...
```

- `$transaction(...)` вызывается без явных опций `{ timeout, maxWait }` → действует дефолт Prisma — interactive transaction timeout **5000ms**, отсчитываемый с момента входа в `$transaction`, а не с момента попытки взять lock.
- Postgres `lock_timeout = '5s'` — независимый таймаут на саму операцию `pg_advisory_xact_lock`.
- При N конкурентных вызовах (тест гоняет `arbConcurrency` — случайное N) транзакции №2..N встают в очередь на advisory lock. На загруженном/шумном CI-раннере (shared vCPU, соседние jobs) суммарное время очереди + выполнение транзакции №1 регулярно вылезает за 5000ms Prisma-таймаута раньше, чем сработает Postgres `lock_timeout` — отсюда три разных гонки таймаутов и непредсказуемый набор fulfilled/rejected.

Не баг бизнес-логики (advisory lock как механизм работает корректно — в норме ровно 1 проходит), баг — слишком тугие таймауты для CI-окружения.

## Предлагаемое направление

1. Поднять Prisma interactive-transaction timeout явно для этого вызова (`$transaction(fn, { timeout: <X> })`), синхронизировав с Postgres `lock_timeout`, либо развести их осознанно (Prisma timeout > Postgres lock_timeout, чтобы Postgres всегда успевал отдать `PERIOD_LOCK_TIMEOUT` первым — сейчас тест и так допускает оба исхода `PERIOD_ALREADY_OPEN`/`PERIOD_LOCK_TIMEOUT`, но не допускает таймаут самой транзакции).
2. Проверить `arbConcurrency` (`apps/api/test/integration/fixtures/arbitraries.ts`) — возможно, верхняя граница N конкурентных промисов слишком высока для дефолтного pool size тестового `PrismaClient` (если N подключений превышает connection pool, лишние ждут саму выдачу коннекшна, что съедает время до начала транзакции).
3. Альтернатива (рассмотреть, не дефолт): retry самого property-теста на конкретный "транзакция протухла по таймингу" exception как infra-флейк, а не как нарушение инварианта — но это маскирует реальную деградацию, если таймауты в проде тоже окажутся тугими под нагрузкой; лучше пофиксить корень (п.1/2).

## Acceptance Criteria

1. [ ] `api-integration` workflow проходит зелёным на этом тесте минимум 5 прогонов подряд (`workflow_dispatch`, без сопутствующих изменений кода между прогонами).
2. [ ] Если таймаут увеличен — задокументирована причина прямо в коде (`period.service.ts`) и/или в ADR-002, почему именно такое значение.
3. [ ] Тест продолжает ловить реальную регрессию: намеренная порча advisory-lock логики (например, временный комментарий `pg_advisory_xact_lock` вызова) должна валить тест детерминированно — проверить вручную перед закрытием задачи.

## Вне scope

- Изменение самого механизма advisory lock (`pg_advisory_xact_lock`) — он работает корректно.
- Required-status-checks конфигурация GitHub (добавление `api-integration` в required) — отдельное организационное решение, не блокируется этой задачей.

## Ссылки

- Тест — `apps/api/test/integration/invariants/adr-002-period-concurrency.integration.spec.ts:44-71`
- Лок/таймаут — `apps/api/src/modules/period/period.service.ts:50-52`
- ADR — `docs/decisions/ADR-002-period-concurrency.md`
- Воспроизведения — CI run `27907248805` (PR #38, 1-я попытка), re-run того же run (2-я попытка), `27930393232` (manual `workflow_dispatch` на `main`, 2026-06-22)
