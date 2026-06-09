# Sub-plan A — §11 Business Correctness Gate (Design)

> **Status:** Draft — awaiting user review (per `superpowers:brainstorming` step 8).
> **Date:** 2026-05-18
> **Source brainstorm:** Sub-plan A stub в `docs/plans/2026-05-17-multi-agent-ecosystem-residual-remediation.md` §6.
> **Next step:** `superpowers:writing-plans` для Wave 1 execution plan.

---

## 1. Goal

Runtime regression suite, доказывающий что бизнес-инварианты CCIP (PeriodEngine, BoQ versioning, weight_coef, DisputeSLA, decay_factor analytics) выполняются на реальной Postgres. Pre-pilot M-13 mandatory gate — без этого suite пилот не sign-offable.

## 2. Brainstorming decisions

| # | Question | Decision | Implication |
|---|----------|----------|-------------|
| D1 | Когда стартуем относительно M-05b/M-05c? | **Infrastructure-first; тесты приходят волнами** | Suite строится сейчас, тесты для pending модулей — placeholder с `describe.skip(...)`; разблокируются по мере landing. |
| D2 | Test DB isolation strategy? | **Shared Postgres container + TRUNCATE per describe** | `--runInBand` обязателен; advisory lock работает (реальные commit); не parallel-safe. |
| D3 | Assertion strategy для invariants? | **Property-based (fast-check) + invariant checks** | `fast-check` генерирует BoQ shapes; ADR invariants проверяются property-based; algorithm scenarios — fixed fixtures. |
| D4 | Success criterion для «done»? | **Coverage matrix algorithm §Part 4 → tests, 100%** | 47 algorithm tests + 4 ADR invariant suites; `coverage-matrix.md` auto-gen; CI gate. |
| D5 | Architectural choice? | **Approach 3 — Hybrid: ADR invariants + algorithm scenarios** | `invariants/adr-*.spec.ts` (property) и `scenarios/<block>-block.spec.ts` (1-to-1 с algorithm). |

## 3. Scope

### 3.1 In scope (algorithm v1.3 §Part 4)

| Блок | Tests | Coverage | Wave |
|------|-------|----------|------|
| **A** weight_coef | A-01..A-05 (5) | property-based + 5 fixed-fixture | W1 |
| **B** ZeroReport | B-01..B-07 (7) | fixed-fixture | W1 (B-04 → W2 если timer infra не готов) |
| **C** PeriodEngine | C-01..C-09 (9) | fixed-fixture + ADR-002/007 invariants | W1 (C-01..04, 07, 09); W2 (C-05/06/08 dispute-dependent) |
| **D** DisputeSLA | D-01..D-09 (9) | fixed-fixture + time-advance | W2 |
| **E** Analytics / forecast / decay_factor | E-01..E-09 (9) | property-based decay + fixed | W3 |
| **F** Baseline update | F-01..F-04 (4) | fixed-fixture + ADR-006 invariants | W4 |
| **G** BoQ versioning | G-01..G-04 (4) | property-based lineage + fixed | W4 |
| **итого** | **47 algorithm tests** + 4 ADR invariant suites | | 4 waves |

### 3.2 Out of scope (final)

| Item | Reason | Покрывается |
|------|--------|-------------|
| H-block (GC change) | Не §11 invariant; post-pilot operation | отдельный suite после M-06 |
| I-block (Sync conflicts) | Multi-tenancy / offline domain | **Sub-plan E** (RLS fuzz) + future Sync regression |
| Load tests, DR scenarios, SLO | §12 Ops gate | **Sub-plan B** |
| K8s deployment correctness | Infra | **Sub-plan C** |
| HTTP-controller integration | Уже в unit `.controller.spec.ts` | существующие unit tests |
| Mobile offline-queue | Mobile domain | **Sub-plan D** |
| Concurrent hook race | Runtime hook subsystem | **Sub-plan F** |
| Performance/latency assertions | Correctness, не performance | **Sub-plan B** |
| Front-end UI behaviour | UI domain | future frontend suite |

### 3.3 Non-goals

- **Не** заменяем unit tests (75+ существующих `*.service.spec.ts` остаются).
- **Не** покрываем edge cases вне algorithm §Part 4.
- **Не** мигрируем unit → integration.
- **Не** запускаем integration в Husky pre-commit (slow); только CI.

## 4. Architecture

### 4.1 Directory layout

```
apps/api/test/integration/                       # NEW
├── jest-integration.json                        # отдельный jest config
├── setup/
│   ├── global-setup.ts                          # boot/connect Postgres, run migrations
│   ├── global-teardown.ts                       # close pools
│   ├── env.ts                                   # DATABASE_URL_TEST, JWT_SECRET_TEST
│   └── truncate.ts                              # TRUNCATE … RESTART IDENTITY CASCADE per FK graph
├── invariants/                                  # ADR property-based
│   ├── adr-002-period-concurrency.spec.ts       # advisory lock under N concurrent
│   ├── adr-006-lineage-aggregation.spec.ts      # split/merge → cumulative_fact stable
│   ├── adr-007-period-immutability.spec.ts      # cascade recalc invariants
│   └── adr-011-snapshot-in-tx.spec.ts           # no closed period without readiness_snapshot
├── scenarios/                                   # algorithm §Part 4 1-to-1
│   ├── a-block-weight-coef.integration.spec.ts
│   ├── b-block-zero-report.integration.spec.ts
│   ├── c-block-period.integration.spec.ts
│   ├── d-block-dispute-sla.integration.spec.ts  # placeholder until W2
│   ├── e-block-analytics.integration.spec.ts    # placeholder until W3
│   ├── f-block-baseline.integration.spec.ts     # placeholder until W4
│   └── g-block-boq-versioning.integration.spec.ts # placeholder until W4
├── fixtures/
│   ├── factories.ts                             # makeTenant, makeObject, makeBoQ(items: n), makeUser
│   ├── arbitraries.ts                           # fast-check arbBoQ, arbContractValues, arbPeriodSequence
│   └── seeds.ts                                 # constant tenant+object для shared scenarios
├── helpers/
│   ├── advance-time.ts                          # mock Date.now + BullMQ delayed jobs
│   ├── login-as.ts                              # NestJS testing module + JWT helper
│   ├── advisory-lock-peek.ts                    # SELECT * FROM pg_locks WHERE locktype='advisory'
│   └── coverage-matrix.ts                       # post-run: emit docs/testing/coverage-matrix.md
└── coverage-matrix.md                           # generated artifact (committed)
```

### 4.2 Test DB strategy

- Reuse `docker-compose.yml` postgres service (T-22 image: pg_partman + pg_cron pre-baked).
- `globalSetup`: подключиться к `DATABASE_URL_TEST`, `prisma migrate deploy`, verify required extensions.
- `beforeEach`: TRUNCATE tenant-scoped tables (FK-aware order; не трогаем `system_config`, `_prisma_migrations`, `partman.*`).
- `--runInBand` обязателен.

### 4.3 Tooling deps

| Package | Purpose | Notes |
|---------|---------|-------|
| `fast-check` | Property-based generators | NEW в `apps/api/devDependencies` |
| `@nestjs/testing` | Test module bootstrap | already present |
| `pg` (raw queries) | TRUNCATE, lock-peek | через `prisma.$queryRaw` |

Не добавляем: `testcontainers`, `jest-extended`, `supertest` (последний — для Sub-plan B).

### 4.4 `jest-integration.json`

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": "\\.integration\\.spec\\.ts$",
  "testTimeout": 30000,
  "globalSetup": "<rootDir>/setup/global-setup.ts",
  "globalTeardown": "<rootDir>/setup/global-teardown.ts",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "moduleNameMapper": {
    "^@ccip/database(.*)$": "<rootDir>/../../../../packages/database/src$1",
    "^@ccip/shared(.*)$": "<rootDir>/../../../../packages/shared/src$1"
  }
}
```

Новый npm script: `"test:integration": "jest --config ./test/integration/jest-integration.json --runInBand"`.

### 4.5 Factories contract (sketch)

```ts
const tenant = await makeTenant(prisma);
const object = await makeObject(prisma, tenant);
const boq = await makeBoQ(prisma, object, { items: 10, contractValues: 'random' });
const period = await makePeriod(prisma, object, { number: 1, status: 'open' });
```

Все фабрики возвращают типизированные DTO; не raw Prisma model.

### 4.6 Property-based example (adr-002)

```ts
test.prop([fc.integer({ min: 2, max: 10 })])(
  'N concurrent OpenPeriod → exactly 1 succeeds',
  async (n) => {
    const { object } = await seedClosedZeroReport();
    const results = await Promise.allSettled(
      Array.from({ length: n }, () => periodService.openPeriod(object.id, ...))
    );
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  },
);
```

## 5. Wave plan

### 5.1 Breakdown

| Wave | Trigger | Algorithm tests | Invariant suites | Effort | Risk |
|------|---------|-----------------|------------------|--------|------|
| W1 | сразу (M-03/04/05a done) | A-01..A-05; B-01..B-07 (кроме B-04); C-01..04, C-07, C-09 | ADR-002, ADR-007 | 2–2.5 dd | low |
| W2 | M-05b merged | D-01..D-09; C-05/06/08; B-04 | + time-advance helper | 1.5–2 dd | medium |
| W3 | M-05c merged | E-01..E-09 | ADR-011 + fake-time | 1–1.5 dd | medium |
| W4 | M-06 merged | F-01..F-04; G-01..G-04 | ADR-006 | 1 dd | low–medium |
| **итого** | | **47 algorithm tests** (5+7+9+9+9+4+4) | 4 ADR suites | **5.5–7 dd** | |

### 5.2 Wave closure criteria

Каждая волна замкнута когда:
1. Все in-scope passing (или `.skip()` + linked issue + reason).
2. `docs/testing/coverage-matrix.md` обновлён (auto-gen из `// @algorithm: <id>` annotations).
3. CI green на full `test:integration` run.
4. CHANGELOG entry.
5. `docs/project-state.md` Active P1 Task moved to next module.
6. (опц.) git tag `subplan-a-w<N>`.

### 5.3 Wave-to-module hand-off protocol

Перед стартом M-05b / M-05c / M-06:
- Прочитать соответствующий `scenarios/<block>-block.integration.spec.ts.skip` (placeholder).
- Реализация модуля должна закрывать все тесты в placeholder.

Placeholder файлы создаются в W1 с `describe.skip(...)` + комментарии `// TODO: enable after <module> lands`.

## 6. CI integration

### 6.1 Existing CI baseline

- `.github/workflows/ci.yml` — unit tests.
- `.github/workflows/db-integration.yml` — T-22 `packages/database/test/*.test.ts`.
- `.github/workflows/nightly-audit.yml`, `portable-clone.yml`, `weekly-orphan-scan.yml` — audit.

### 6.2 New workflow: `api-integration.yml`

```yaml
name: api-integration
on:
  pull_request:
    paths:
      - 'apps/api/src/modules/**'
      - 'apps/api/test/integration/**'
      - 'packages/database/prisma/**'
  schedule:
    - cron: '0 3 * * *'   # nightly full run
jobs:
  api-integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: ghcr.io/<repo>/ccip-postgres:latest  # T-22 baked image
        ports: ['5432:5432']
        env: { POSTGRES_USER: ccip, POSTGRES_PASSWORD: ccip, POSTGRES_DB: ccip_test }
        options: --health-cmd pg_isready ...
    steps:
      - checkout
      - setup pnpm@v4
      - pnpm install --frozen-lockfile
      - pnpm --filter @ccip/database migrate:deploy
      - pnpm --filter @ccip/api test:integration
      - upload coverage-matrix.md as artifact
```

Decision: новый файл workflow, не extend `db-integration.yml` (разные триггеры, разные commands).

### 6.3 PR gate

На PR в `apps/api/src/modules/**` — required check `api-integration`.

### 6.4 Coverage-matrix automation

```ts
// helpers/coverage-matrix.ts (jest globalTeardown post-process)
// 1. Parse все *.integration.spec.ts для `// @algorithm: <id>` annotations
// 2. Cross-reference algorithm_v1_3.md §Part 4 (47 tests)
// 3. Emit docs/testing/coverage-matrix.md
// 4. Diff vs committed — fail CI если mismatch (drift detector)
```

Похоже на pattern `tools/audit/*`; можно интегрировать как 18-й check Husky audit-suite после W1.

## 7. Success criteria

### 7.1 «Sub-plan A DONE»

ALL must hold:
1. W1 + W2 + W3 + W4 closed.
2. 47 algorithm tests covered (0 skip без linked issue).
3. 4 ADR invariant suites passing.
4. CI gate `api-integration` required + green на main 7 дней.
5. `docs/audits/2026-05-07-multi-agent-ecosystem.md` §11 verdict обновлён.
6. `docs/project-state.md` §5 содержит строку про Sub-plan A.

### 7.2 Pre-pilot M-13 gate

W1+W2+W3 закрыты (W4 = post-pilot acceptable если зафиксировано в ADR-XXX-pilot-gate-deferrals).

## 8. Dependencies

| Dependency | Provides | Required by | Blocking? |
|------------|----------|-------------|-----------|
| T-22 (pg_partman/pg_cron image) | Test DB container | global-setup | done (`b52fda5`) |
| M-05b | DisputeSLA module | W2 | blocks W2 only |
| M-05c | Analytics + MV | W3 | blocks W3 only |
| M-06 | Baseline F/G | W4 | blocks W4 only |

## 9. Risk register

| Risk | Wave | Mitigation |
|------|------|------------|
| `pg_advisory_xact_lock` flaky на CI (timing) | W1 | retry-with-backoff helper; explicit `lock_timeout = '5s'` |
| BullMQ jobs не drain между describe-блоками | W2 | `beforeEach: await queue.drain(); queue.clean('all', 0)` |
| Fake-time не совместим с pg `NOW()` | W2/W3 | `clock.tick()` + Postgres `clock_timestamp()` сравнения |
| `fast-check` runs медленные | W1+ | `numRuns: 25` CI / 100 local |
| Coverage matrix gen ломается при rename test ID | W1 | hard-fail если annotation references несуществующий ID |

## 10. Open questions for writing-plans

(Не для design; уточняются в каждой wave-plan сессии.)

1. **B-04 timer infra** — `jest.useFakeTimers()` vs `pg_sleep` + advance-time? → W1 plan.
2. **D-03/D-05 SLA timer** — `clock.tick(3 * 24 * 3600 * 1000)` + `processNextDelayed()`? → W2 plan.
3. **E-04 «плановая пауза»** — фикстура или параметр `makePeriod`? → W3 plan.
4. **G-03 contract_value change** — trigger автоматический или explicit service call? → W4 plan (зависит от M-06 design).
5. **Property-based seed reproducibility** — fixed `FC_SEED` env var? → W1 plan.

## 11. Failure modes

| Failure | Response |
|---------|----------|
| W2 заблокирован M-05b на 2+ недели | W1 коммитится independently; W2 placeholder остаётся; M-05c не блокируется |
| Property-based находит баг в trigger | `FEEDBACK-XXX` → ccip-dba/backend-core fix → regression case добавляется в W4 |
| Coverage-matrix gen ломается на rename | hard-fail CI; PR должен синхронизировать algorithm + matrix |
| CI postgres image без pg_partman | Fallback: T-22 db-integration.yml setup; иначе issue к ccip-devops |
| `runInBand` >5 min | Profile; возможна оптимизация TRUNCATE через DROP/CREATE schema |

## 12. Document outputs

После W1..W4:
- `docs/superpowers/specs/2026-05-18-business-correctness-gate-design.md` — этот файл.
- `docs/plans/2026-05-XX-sub-plan-a-wave-1.md` — writing-plans output для W1 (next session).
- `docs/plans/2026-05-XX-sub-plan-a-wave-2.md` — W2 (после M-05b).
- `docs/plans/2026-05-XX-sub-plan-a-wave-3.md` — W3 (после M-05c).
- `docs/plans/2026-05-XX-sub-plan-a-wave-4.md` — W4 (после M-06).
- `docs/testing/coverage-matrix.md` — auto-generated, committed.
- `docs/testing/integration-suite-readme.md` — onboarding guide.

## 13. Cross-references

- `docs/algorithm_v1_3.md` §Часть 4 — таблица тестирования (источник 47 algorithm tests).
- `docs/decisions/ADR-002-period-concurrency.md` — period advisory lock invariants.
- `docs/decisions/ADR-006-boq-versioning.md` — work_lineage_id + boq_item_lineage_links.
- `docs/decisions/ADR-007-period-immutability.md` — cascade recalc.
- `docs/decisions/ADR-011-analytics-precomputation.md` — calcReadiness in-transaction.
- `docs/plans/2026-05-17-multi-agent-ecosystem-residual-remediation.md` §6 (Sub-plan A stub).
- `docs/audits/2026-05-07-multi-agent-ecosystem.md` — audit findings §11.

## 14. Status

- [x] Brainstorming session (this doc).
- [ ] User review of this doc.
- [ ] `superpowers:writing-plans` для Wave 1.
- [ ] Wave 1 execution.
- [ ] Wave 2 (after M-05b).
- [ ] Wave 3 (after M-05c).
- [ ] Wave 4 (after M-06).
- [ ] Sub-plan A DONE marker → `docs/project-state.md` §5.
