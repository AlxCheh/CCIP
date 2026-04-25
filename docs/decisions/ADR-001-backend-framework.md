# ADR-001 — Backend Framework

**Статус:** Принято rev 2
**Закрытый риск:** R-01

## Решение
NestJS (TypeScript) + Prisma + Redis/BullMQ — единый стек для API, Worker и мобильного клиента.

## Контекст
SLA Scheduler требует distributed lock и job deduplication. Нужен модульный монолит с декларативным RBAC. TypeScript-монорепозиторий даёт shared DTO между React Web, React Native и Backend.

## Практический кейс
NestJS Module = CCIP Module 1:1: `init`, `zero-report`, `period`, `dispute`, `analytics`, `baseline`, `sync`. Guard `RolesGuard` + декоратор `@Roles(...)` покрывают матрицу §8.2. BullMQ-очередь `sla` запускается только в `ROLE=worker` поде.

## Контракт реализации

Структура модулей: `src/modules/{init,zero-report,period,dispute,analytics,baseline,sync}`, `src/common/{guards,prisma,scheduler}`.

Prisma: `prisma migrate deploy` в production; `prisma migrate dev` только в dev.

**Connection pool:** `DB_POOL_SIZE` через Helm values per-env. Формула: `(max_connections - 10) / pod_count`. Алерт при `pg_stat_activity WHERE state='active' > 80%` от `max_connections`.

**Batch queries:** `Promise.all(items.map(item => tx.$queryRaw(...)))` запрещён в analytics-сервисах. Требуется один SQL с GROUP BY. Любой цикл по `workItems` с `await tx.$queryRaw` внутри → обязательный ревью-коммент.

**Transaction SLA:**
| Операция | Лимит | Действие |
|---|---|---|
| `closePeriod` | ≤ 3 сек | Alert; расследование индексов |
| `calcReadiness` | ≤ 2 сек | Alert; проверить batch queries |
| `openPeriod` (advisory lock) | ≤ 5 сек | `PERIOD_LOCK_TIMEOUT` |

**SLA Worker:** `onModuleInit` пропускает recovery scan если `ROLE !== 'worker'` и `ENABLE_SLA_RECOVERY !== 'true'`.

**Connection pooler:** ОБЯЗАН работать в режиме session pooling (не transaction pooling). AWS RDS Proxy — запрещён. Нарушение нейтрализует ADR-002.

**Redis AOF:** `appendonly yes`, `appendfsync everysec` — обязательно для production.

**Multi-tenancy:** не реализован в v1.0; все `findMany` уже фильтруют по `objectId` или `organizationId`.

## Отклонённые альтернативы
| Альтернатива | Причина |
|---|---|
| FastAPI (Python) | Предпочтительней только при ML-pipeline в первые 12 мес или без TypeScript-опыта |
