# Project State

> Единственный источник правды о текущем состоянии реализации.  
> Читать с `limit:25` в начале каждой сессии — §1 даёт полный контекст.  
> Обновлять после каждой завершённой задачи (feedback-loop.md §4).

---

## 1. Status Overview

| Поле | Значение |
|------|----------|
| **Last Updated** | 2026-06-02 |
| **Current Phase** | 8 — Web App |
| **Phase Status** | ✓ complete |
| **Active P1 Task** | — (M-08 завершён; следующий трек выбирает пользователь: M-10 / M-08 design-pass) |
| **Next Milestone** | M-10 Security / Immutability / REVOKE (разблокирован) |
| **Active Blockers** | 0 — нет |
| **Open Feedbacks** | 0 |
| **Last Audit** | Red Team 2026-05-07 — closed (`docs/audits/red-team-2026-05-07.md`) |

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
| M-10 | P1 | Security / Immutability / REVOKE | 10 | ○ pending | Pilot |
| M-11 | P1 | Testing / SLA Recovery scan | 11 | ○ pending | Pilot |
| M-12 | P1 | Prod Infra / K8s Worker | 12 | ○ pending | Pilot |
| M-13 | P1 | Pilot | 13 | ○ pending | — |
| M-M | P4 | Mobile App | post | ○ pending | M-13 |

¹ M-05b: реализация завершена + **E2E acceptance ПРОЙДЕН 2026-05-29** (Scenario A + Redis-recovery, Task 10). 279 unit + audit 18/18. Bring-up + schema/code drift (B-01,B-03..B-06) закрыты в W8. **B-02** (migration-history drift) закрыт 2026-05-31 через `migrate resolve --applied`. Остатки — cron PR #9 + orphan-строки истории (косметика, не блокируют).

---

## 3. Active Blockers

| ID | Блокер | Заблокированный модуль | Разблокируется когда |
|----|--------|------------------------|----------------------|
| — | Нет активных блокеров | — | — |

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
