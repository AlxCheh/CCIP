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
- [ADR-015-sla-worker-canonical-path.md](ADR-015-sla-worker-canonical-path.md) — canonical path для SLA worker (M-05b)

### Data / Versioning
- [ADR-006-boq-versioning.md](ADR-006-boq-versioning.md) — версионирование BOQ
- [ADR-013-pdf-reports.md](ADR-013-pdf-reports.md) — генерация PDF-отчётов

### Auth & Security
- [ADR-009-rbac-gp-token.md](ADR-009-rbac-gp-token.md) — RBAC + GP token
- [ADR-012-multitenancy.md](ADR-012-multitenancy.md) — изоляция тенантов

### Notifications
- [ADR-014-push-notifications.md](ADR-014-push-notifications.md) — push-уведомления

### Orchestration / Agent Runtime
- [ADR-016-token-efficiency-auditor.md](ADR-016-token-efficiency-auditor.md) — token-efficiency auditor: read-only агент анализа bloat + self-learning rule lifecycle
- [ADR-017-state-update-observability.md](ADR-017-state-update-observability.md) — видимость пропуска ## State Update: флаг missing_state_update + сводка на Stop
- [ADR-018-machine-enforced-runtime-governance.md](ADR-018-machine-enforced-runtime-governance.md) — три-плоскостная machine-enforced governance: enforcement (deny), telemetry (events), semantic (manifest+RGS)
- [ADR-019-cross-process-state-lock.md](ADR-019-cross-process-state-lock.md) — межпроцессный лок session-state (HA-2/E-2) + честная градация INV-STATE-CONTRACT (signal→enforced через exemption)
- [ADR-020-main-agent-token-estimate.md](ADR-020-main-agent-token-estimate.md) — эвристическая оценка токенов tool-I/O (bytes/K с кириллической поправкой) поверх events.jsonl; частичное закрытие token-blindness ADR-016 [ЧАСТ.]
- [ADR-021-deterministic-auto-remediation.md](ADR-021-deterministic-auto-remediation.md) — детерминированный `--fix` для path-canonical prefix-дрейфа (advisory, не blocking); первый класс авто-коррекции (#1)
- [ADR-022-fail-closed-lock.md](ADR-022-fail-closed-lock.md) — fail-closed opt-in для state-lock (`CCIP_STATE_LOCK_FAILCLOSED=1`): пропуск fn + durable stderr на таймауте, дефолт fail-open неизменён (#4)

---

## Правила загрузки

1. Определить архитектурный модуль задачи.
2. Прочитать только соответствующий ADR.
3. Дополнительные ADR — только при подтверждённой зависимости.

> Читать весь каталог ADR запрещено.
