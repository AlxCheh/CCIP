# ADR Routing Index

Маршрутизация к архитектурным решениям платформы CCIP.

> Если задача не изменяет архитектурное решение — ADR не читать.

---

## ADR по модулям

### Backend Framework
- [ADR-001-backend-framework.md](ADR-001-backend-framework.md) — NestJS + Prisma + BullMQ

### Period Engine
- [ADR-002-period-concurrency.md](ADR-002-period-concurrency.md) — параллелизм и lifecycle периода
- [ADR-007-period-immutability.md](ADR-007-period-immutability.md) — иммутабельность закрытого периода

### Sync & Offline
- [ADR-003-offline-conflict-resolution.md](ADR-003-offline-conflict-resolution.md) — разрешение конфликтов синхронизации
- [ADR-008-watermelondb-offline.md](ADR-008-watermelondb-offline.md) — offline-first через WatermelonDB

### Analytics
- [ADR-004-materialized-view-staleness.md](ADR-004-materialized-view-staleness.md) — допустимая устарелость MV
- [ADR-011-analytics-precomputation.md](ADR-011-analytics-precomputation.md) — предвычисление аналитики

### Infrastructure / Workers
- [ADR-005-sla-scheduler-reliability.md](ADR-005-sla-scheduler-reliability.md) — надёжность SLA-воркера и BullMQ
- [ADR-010-audit-log-partitioning.md](ADR-010-audit-log-partitioning.md) — партиционирование audit log

### Data / Versioning
- [ADR-006-boq-versioning.md](ADR-006-boq-versioning.md) — версионирование BOQ
- [ADR-013-pdf-reports.md](ADR-013-pdf-reports.md) — генерация PDF-отчётов

### Auth & Security
- [ADR-009-rbac-gp-token.md](ADR-009-rbac-gp-token.md) — RBAC + GP token
- [ADR-012-multitenancy.md](ADR-012-multitenancy.md) — изоляция тенантов

### Notifications
- [ADR-014-push-notifications.md](ADR-014-push-notifications.md) — push-уведомления

---

## Правила загрузки

1. Определить архитектурный модуль задачи.
2. Прочитать только соответствующий ADR.
3. Дополнительные ADR — только при подтверждённой зависимости.

> Читать весь каталог ADR запрещено.
