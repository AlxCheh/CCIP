# ADR Routing Index

Маршрутизация к архитектурным решениям платформы CCIP. **Канонический источник списка ADR — `docs/decisions/index.md`.** Этот файл — лишь топик-индекс; при расхождении побеждает `index.md`.

> Если задача не изменяет архитектурное решение — ADR не читать.

---

## ADR по модулям

### Backend Framework
- `ADR-001-backend-framework.md` — NestJS + Prisma + BullMQ + PgBouncer

### Period Engine
- `ADR-002-period-concurrency.md` — advisory locks
- `ADR-007-period-immutability.md` — append-only закрытого периода

### Sync & Offline
- `ADR-003-offline-conflict-resolution.md`
- `ADR-008-watermelondb-offline.md`

### Analytics
- `ADR-004-materialized-view-staleness.md`
- `ADR-011-analytics-precomputation.md`

### Infrastructure / Workers
- `ADR-005-sla-scheduler-reliability.md`
- `ADR-010-audit-log-partitioning.md`
- `ADR-015-sla-worker-canonical-path.md` — canonical path SLA worker (M-05b)

### Data / Versioning
- `ADR-006-boq-versioning.md`
- `ADR-013-pdf-reports.md`

### Auth & Security
- `ADR-009-rbac-gp-token.md`
- `ADR-012-multitenancy.md`

### Notifications
- `ADR-014-push-notifications.md`

---

## Правила загрузки

1. Определить архитектурный модуль задачи.
2. Прочитать только соответствующий ADR.
3. Дополнительные ADR — только при подтверждённой зависимости.

> Читать весь каталог ADR запрещено.
