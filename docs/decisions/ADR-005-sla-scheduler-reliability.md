# ADR-005 — SLA Scheduler: надёжность и идемпотентность

**Статус:** Принято rev 2
**Закрытый риск:** R-05

## Решение
BullMQ `jobId` deduplication + идемпотентная проверка `executedAt` в БД + recovery scan при старте + K8s `Recreate` strategy.

## Контекст
SLA-таймеры (deadlock A: день 3/5, deadlock B: день 7/14) — критичные бизнес-события. При потере Redis BullMQ теряет все delayed jobs; записи в `sla_events` остаются в PostgreSQL — orphaned events. При double-start двух подов без deduplication событие выполняется дважды.

## Практический кейс
Redis потерян при миграции окружения. При старте воркера `onModuleInit` читает все `sla_events WHERE executedAt IS NULL` (включая просроченные) и переставляет в BullMQ с `delay=0` для просроченных. Метрика `sla_recovery_overdue_total` показывает 3 — три события опоздали, выполняются немедленно.

## Контракт реализации

**Планирование:** `jobId: 'sla-{event.id}'`, `attempts: 3`, `backoff: {type: 'exponential', delay: 10_000}`, `removeOnComplete: true`, `removeOnFail: false`.

**Воркер:** `lockDuration: 60_000`, `stalledInterval: 30_000`. Идемпотентность: `if (!event || event.executedAt) return`.

**Recovery scan — только в `ROLE=worker`** (или `ENABLE_SLA_RECOVERY=true`). Фильтр `WHERE executedAt IS NULL` — БЕЗ ограничения `scheduledAt > NOW()`. Просроченные — `delay=0`. Повторное добавление существующего `jobId` — no-op.

**P-24:** триггер `trg_sla_events_no_delete` → `fn_sla_events_no_delete()` — DELETE запрещён на уровне БД. Отмена только через `UPDATE executed_at = NOW()`.

**K8s Deployment:**
- `replicas: 1`, `strategy.type: Recreate`
- `terminationGracePeriodSeconds: 30` (должен быть < `lockDuration: 60s`)
- `env ROLE=worker`
- `livenessProbe`/`readinessProbe`: `checkBoth()` — проверяет Redis И PostgreSQL

**Redis AOF:** `appendonly yes`, `appendfsync everysec` — обязательно.

**Мониторинг:** `failed count > 0` в очереди `sla` → алерт. Completed jobs удаляются из Redis; источник истины — `sla_events.executed_at`.

## Отклонённые альтернативы
| Альтернатива | Причина |
|---|---|
| RollingUpdate strategy | Два пода одновременно; избыточная конкуренция за jobs |
| Только BullMQ без `executedAt` | Нет идемпотентности при stalled job retry |
| Cron без recovery scan | Orphaned events при потере Redis никогда не выполнятся |
