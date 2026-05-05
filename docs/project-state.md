# Project State

> Единственный источник правды о текущем состоянии реализации.  
> Читать с `limit:25` в начале каждой сессии — §1 даёт полный контекст.  
> Обновлять после каждой завершённой задачи (feedback-loop.md §4).

---

## 1. Status Overview

| Поле | Значение |
|------|----------|
| **Last Updated** | 2026-05-05 |
| **Current Phase** | 2 — Auth & Middleware |
| **Phase Status** | 🔄 active |
| **Active P1 Task** | M-02a — JWT+RBAC Guards+GpTokenGuard; M-02b — AuditLogService; M-02c — TenantMiddleware |
| **Next Milestone** | M-02a + M-02b + M-02c завершены → M-03 разблокирован |
| **Active Blockers** | см. §3 |
| **Open Feedbacks** | 0 |

---

## 2. Module Status

| ID | Pri | Модуль | Этап | Статус | Блокирует |
|----|-----|--------|------|--------|-----------|
| M-00 | P1 | ADR-012 Multi-tenancy | 0 | ✓ done | — |
| M-01a | P1 | Docker + PostgreSQL + Redis AOF + PgBouncer | 1 | ✓ done | — |
| M-01b | P1 | Prisma schema P-01..P-29 | 1 | ✓ done | — |
| M-02a | P1 | Auth: JWT + RBAC Guards + GpTokenGuard | 2 | 🔄 active | все API |
| M-02b | P1 | AuditLogService (append-only) | 2 | 🔄 active | Immutability |
| M-02c | P1 | Multi-tenancy middleware | 2 | 🔄 active | все сервисы |
| M-03 | P1 | Init Module A: Objects + BoQ + weight_coef trigger | 3 | ○ pending | M-04..M-07 |
| M-04 | P1 | ZeroReport Module B | 4 | ○ pending | M-05a |
| M-05a | P1 | PeriodEngine Module C | 5 | ○ pending | M-05b, M-05c |
| M-05b | P1 | DisputeSLA Module D + BullMQ Worker | 5 | ○ pending | M-05c, M-08 |
| M-05c | P1 | Analytics Module E + MV refresh | 5 | ○ pending | M-08 |
| M-06 | P3 | Baseline F/G + GC Change H | 6 | ○ pending | M-08 |
| M-07 | P2 | Sync API I | 7 | ○ pending | M-08 |
| M-08 | P1 | Web App: Dashboard + Period Cycle + GP Form | 8 | ○ pending | Pilot |
| M-10 | P1 | Security / Immutability / REVOKE | 10 | ○ pending | Pilot |
| M-11 | P1 | Testing / SLA Recovery scan | 11 | ○ pending | Pilot |
| M-12 | P1 | Prod Infra / K8s Worker | 12 | ○ pending | Pilot |
| M-13 | P1 | Pilot | 13 | ○ pending | — |
| M-M | P4 | Mobile App | post | ○ pending | M-13 |

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
