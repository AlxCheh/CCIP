# Project State

> Единственный источник правды о текущем состоянии реализации.  
> Читать с `limit:25` в начале каждой сессии — §1 даёт полный контекст.  
> Обновлять после каждой завершённой задачи (feedback-loop.md §4).

---

## 1. Status Overview

| Поле | Значение |
|------|----------|
| **Last Updated** | 2026-07-07 |
| **Current Phase** | 12 — Prod Infra / K8s Worker |
| **Phase Status** | ◑ scaffold merged to `main` + pushed to origin (Tasks 1-16), Task 17 (kind validation) still pending Docker Desktop restart, Task 18 (plan close-out) not started |
| **Active P1 Task** | M-12: Task 17 (kind-up.sh cluster run) — restart Docker Desktop, then `sh infra/k8s/scripts/kind-up.sh` |
| **Next Milestone** | M-12 full done → M-13 Pilot |
| **Active Blockers** | 1 — B-CI-01 (GitHub Actions quota) |
| **Open Feedbacks** | 0 |
| **Last Audit** | Red Team 2026-05-07 — closed (`docs/audits/2026-05-07-red-team.md`) |

---

## 2. Module Status

| ID | Pri | Модуль | Этап | Статус | Блокирует |
|----|-----|--------|------|--------|-----------|
| M-00 | P1 | ADR-012 Multi-tenancy | 0 | ✓ done | — |
| M-01a | P1 | Docker + PostgreSQL + Redis AOF + PgBouncer | 1 | ✓ done | — |
| M-01b | P1 | Prisma schema P-01..P-29 | 1 | ✓ done | — |
| M-02a | P1 | Auth: JWT + RBAC Guards + GpTokenGuard | 2 | ✓ done | — |
| M-02b | P1 | AuditLogService (append-only) | 2 | ✓ done | — |
| M-02c | P1 | Multi-tenancy middleware | 2 | ✓ done | — |
| M-03 | P1 | Init Module A: Objects + BoQ + weight_coef trigger | 3 | ✓ done | — |
| M-04 | P1 | ZeroReport Module B | 4 | ✓ done | — |
| M-05a | P1 | PeriodEngine Module C | 5 | ✓ done | — |
| M-05b | P1 | DisputeSLA Module D + BullMQ Worker | 5 | ✓ done ¹ | — |
| M-05c | P1 | Analytics Module E + MV refresh | 5 | ✓ done | — |
| M-06 | P3 | Baseline F/G + GC Change H | 6 | ○ pending | M-08 |
| M-07 | P2 | Sync API I | 7 | ○ pending | M-08 |
| M-08 | P1 | Web App: Dashboard + Period Cycle + GP Form | 8 | ✓ done | Pilot |
| M-10 | P1 | Security / Immutability / REVOKE | 10 | ✓ done | — |
| M-11 | P1 | Testing / SLA Recovery scan | 11 | ✓ done ⁴ | Pilot |
| M-12 | P1 | Prod Infra / K8s Worker | 12 | ◑ scaffold done ⁵, kind run pending | Pilot |
| M-13 | P1 | Pilot | 13 | ○ pending | — |
| M-M | P4 | Mobile App | post | ○ pending | M-13 |

⁵ M-12 K8s scaffold (2026-06-26, worktree `worktree-m12-k8s-scaffold`, 16 коммитов): HealthModule (T1-3), Dockerfile API+Web (T4-5), K8s base manifests Kustomize (T6-15: namespace, Postgres/PgBouncer/Redis StatefulSets, Vault dev-server + injector manifests vendored через helm template, API+SLA Worker+Web Deployments, Ingress + cert-manager ClusterIssuer, base/kustomization.yaml), overlays/dev (imagePullPolicy:Never), kind-up.sh + kind-config.yaml (T16). Побочные фиксы сессии: path-to-regexp v8 wildcard `health/*path`, Node v24 ESM `./generated/client/index.js`, `binaryTargets linux-musl-openssl-3.0.x` для Alpine, убрана eager `$connect()` из PrismaService.onModuleInit (K8s liveness anti-pattern). staging/prod overlays — заглушки до выбора облачного провайдера (follow-up план); Observability/Backup automation — отдельный follow-up.
**2026-07-07:** ветка `worktree-m12-k8s-scaffold` смёржена в `main` (`2d9485f`) и запушена в origin (`d52dd5e`), т.к. до этого код Tasks 1-16 существовал только в немёрженной ветке — `main` документировал их как готовые, но не содержал файлов. Перед merge-коммитом прогнан полный юнит-набор `apps/api`: 25 suites / 305 tests — 0 провалов. Из worktree также восстановлена и перенесена отдельным коммитом (`d52dd5e`) незакоммиченная правка `kind-config.yaml` (пин `kindest/node:v1.32.3` + лейбл `ingress-ready=true` на control-plane нод, нужен для ingress-nginx на `kind`) — была найдена при очистке worktree перед его удалением. Worktree и ветка `worktree-m12-k8s-scaffold` удалены после переноса. **Task 17** (kind-up.sh реальный прогон + ADR-005 recovery-scan) по-прежнему **не выполнен** — заблокирован Docker Desktop read-only containerd filesystem; не code-проблема, требует restart Docker Desktop. **Task 18** (финальное обновление project-state + closing commit плана) тоже не выполнен — ждёт результата Task 17, прежде чем M-12 можно пометить `✓ done` в §2.

⁴ M-11 W3 D-block (2026-06-21, PR #29–#37, 9 PR последовательно смерджены в `main`): SLA Сценарий B (D-05/D-06) реализован — `DisputeService.submitGpResponse/rejectGpResponse`, новое поле `Discrepancy.gcResponseAt`, `DisputeSlaWorker` обработчики `director_deadline_day7`/`sc_figure_applied_day14`; D-03/D-04 расконсервированы (дубли заменены ссылкой), D-09 (`clearSystemicFlag`) был уже реализован — закрыт только тестом. Заодно закрыты 5 находок, оставленных "вне скоупа" предыдущей сессией (B-block опечатки+missing features B-03/B-06, C-block missing features C-03/C-04/C-07/C-09, ADR-007 REVOKE-тест бил через `ccip_owner`, governance-схема `degraded[]`) и 4 находки CI/схемного дрифта, обнаруженные по ходу верификации: multer high-severity advisory + неопубликованный ghcr-образ, 6-часовой hang в `pnpm test:audit` (stdin-листенер без `require.main` гарда), 2 lint-ошибки никогда не достигавшие CI, 3 constraint/trigger-дрифта (`periods_status_check`, `period_facts_discrepancy_status_check`, `fn_period_facts_bump_version`) — миграции никогда не совпадали с реальностью на чистой БД, маскировались годами на одном и том же hand-patched локальном контейнере. Верифицировано end-to-end на полностью чистой БД (новый `docker build` + `migrate deploy` с нуля): full integration suite — 0 провалов. E-04..E-09 (advanced analytics) смерджены 2026-06-22 в PR #28 (`worktree-m11-w4-workpace-analytics`, коммит `eb1aa74`) — `WorkPaceService.calcItemPace`/`calcObjectForecast` (decay-weighted темп, исключение плановых пауз, детекция выбросов, два прогноза + gap-флаг), wiring в `closePeriod`/`recalcSnapshotCascade`, все 9 задач плана `docs/plans/2026-06-18-m11-w4-workpace-analytics.md` закрыты. M-11 (W1–W4) полностью закрыт. Параллельно теми же 9 PR (#29–#38, в т.ч. этой группой) закрыты все 5 находок из `docs/plans/2026-06-19-five-followup-findings.md` (Phase 1–4); Phase 5 этого плана (данная правка project-state.md) выполнена 2026-06-22.

³ M-11 W2 (2026-06-17): D-block (D-01/D-02/D-07/D-08) + E-block (E-01/E-02/E-03). Реализован `calcReadiness()` в PeriodService (заменяет TODO M-05c). 7 новых зелёных тестов.

² M-11 W1 (2026-06-16): интеграционная инфраструктура `apps/api/test/integration/` — Jest 30 + runInBand, pg-контейнер T-22, truncate/factories/arbitraries, helpers, 5 сценарных блоков (A/B/C активны, D/E/F/G — skip-плейсхолдеры), ADR-002/ADR-007 инварианты, CI workflow. `pnpm test:integration`.

¹ M-05b: реализация завершена + **E2E acceptance ПРОЙДЕН 2026-05-29** (Scenario A + Redis-recovery, Task 10). 279 unit + audit 18/18. Bring-up + schema/code drift (B-01,B-03..B-06) закрыты в W8. **B-02** (migration-history drift) закрыт 2026-05-31 через `migrate resolve --applied`. Остатки — cron PR #9 + orphan-строки истории (косметика, не блокируют).

---

## 3. Active Blockers

| ID | Блокер | Заблокированный модуль | Разблокируется когда |
|----|--------|------------------------|----------------------|
| B-CI-01 | GitHub Actions перестал создавать новые workflow runs после 2026-06-21 (вероятно — исчерпан лимит расходов из-за ранее найденного 6-часового hang на 3 OS-раннерах, особенно дорогой macOS×10). Подтверждено: push в ветку не создаёт run ни в `queued`, ни в `waiting` — billing API недоступен с текущим токеном (нужен scope `user`). Девять PR этой сессии (#29–#37) смерджены через `gh pr merge --admin` без живого CI-подтверждения, опираясь на локальную верификацию (чистая БД с нуля, 0 провалов). | Любой новый PR — не получит реального CI-сигнала | Владелец репо проверит GitHub → Settings → Billing → Plans and usage → Actions и поднимет лимит/подождёт сброса |

---

## 4. Active Cross-Module Dependencies

| От | К | Причина | Статус |
|----|---|---------|--------|
| — | — | Нет активных межмодульных зависимостей | — |

---

## 5. Completed Modules

| ID | Модуль | Дата | DONE-ref |
|----|--------|------|----------|
| M-00 | ADR-012 Multi-tenancy | 2026-05-05 | ADR-012-multitenancy.md (Статус: Принято) |
| M-01a | Docker + PostgreSQL + Redis AOF + PgBouncer + MinIO | 2026-05-05 | infra/docker/docker-compose.yml |
| M-01b | Prisma schema P-01..P-29 | 2026-05-05 | packages/database/prisma/schema.prisma + migrations/0001_initial |
| M-02a | Auth: JWT + RBAC Guards + GpTokenGuard | 2026-05-05 | apps/api/src/common/guards/ + auth/ |
| M-02b | AuditLogService (append-only) | 2026-05-05 | apps/api/src/common/audit/ |
| M-02c | Multi-tenancy middleware (TenantMiddleware + PrismaTenant $use) | 2026-05-05 | apps/api/src/common/prisma/tenant.* |
| M-03 | Init Module A: ObjectsModule, BoQModule, SystemConfigModule, DocumentsModule | 2026-05-06 | apps/api/src/modules/objects/ + boq/ + system-config/ + documents/ |
| M-04 | ZeroReport Module B: create, upsertItem, submit, approve (37 tests) | 2026-05-06 | apps/api/src/modules/zero-report/ |
| M-05a | PeriodEngine Module C: openPeriod (gpToken), submitGp, upsertPeriodFact, closePeriod, findById (38 tests) | 2026-05-07 | apps/api/src/modules/period/ |
| M-05b | DisputeSLA Module D + BullMQ Worker: E2E acceptance (Scenario A + Redis-recovery), 279 unit | 2026-05-29 | apps/api/src/modules/dispute-sla/ |
| M-05c | Analytics Module E + MV refresh: AnalyticsComputeService, MvRefreshWorker, forecast_reason, B-02 closed | 2026-05-31 | apps/api/src/modules/analytics/ |
| M-08 | Web App: Dashboard директора + Period Cycle стройконтроля + GP Form (GpToken) | 2026-06-02 | apps/web/ (PR #10 Dashboard, PR #11 GP Form) |

---

## 6. Update Protocol

### Когда обновлять

| Событие | Поле |
|---------|------|
| Начата работа по модулю | §2: статус → `🔄 active`; §1: Current Phase, Active P1 Task, Next Milestone |
| Завершён модуль | §2: статус → `✓ done`; §5: добавить строку; §1: Next Milestone |
| Обнаружен блокер | §3: добавить строку; §1: Active Blockers |
| Блокер снят | §3: удалить строку |
| Начата cross-module задача | §4: добавить строку |
| Cross-module задача завершена | §4: удалить строку |
| Создан FEEDBACK-XXX | §1: Open Feedbacks +1 |
| FEEDBACK закрыт | §1: Open Feedbacks -1 |

### Кто обновляет

Любой агент обязан обновить project-state при завершении задачи (feedback-loop.md §4 обязывает).  
При обнаружении нового блокера — немедленно, не ожидая завершения задачи.

### Легенда

| Символ | Значение |
|--------|----------|
| `✓` | Завершён и проверен |
| `🔄` | В работе сейчас |
| `⛔` | Заблокирован (причина в §3) |
| `○` | Ожидает предшественника |
