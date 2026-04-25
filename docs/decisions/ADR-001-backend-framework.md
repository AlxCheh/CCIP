# ADR-001 — Backend Framework

**Статус:** Принято (rev 2 — 2026-04-25)  
**Дата:** 2026-04-24  
**Риск:** R-01

## Решение

**NestJS (TypeScript) + Prisma + Redis/BullMQ**

## Обоснование

| Фактор | Решающий аргумент |
|--------|-------------------|
| SLA Scheduler | BullMQ: distributed lock, job deduplication, K8s-ready из коробки |
| Единый стек | TypeScript на всех уровнях (React Web + React Native + Backend) — shared DTO/types |
| Модульный монолит | NestJS Module = CCIP Module 1:1 (Init, ZeroReport, PeriodEngine, Dispute, Analytics, OfflineSync) |
| RBAC | Guards + Decorators декларативно покрывают матрицу §8.2 |

## Отклонённые альтернативы

**FastAPI (Python):** предпочтительнее если ML-pipeline планируется в первые 12 месяцев или команда без TypeScript-опыта.

## Контракт реализации

```
backend/
  src/
    modules/
      init/          # Блок A
      zero-report/   # Блок B
      period/        # Блок C
      dispute/       # Блок D
      analytics/     # Блок E
      baseline/      # Блок F
      sync/          # Блок I
    common/
      guards/        # RBAC: RolesGuard, GpTokenGuard
      prisma/        # PrismaService
      scheduler/     # BullMQ queues
```

ORM: Prisma (миграции через `prisma migrate deploy` в production; `prisma migrate dev` только в dev).

## Performance Contract

### Connection Pool

```
Prisma pool per pod ≤ (postgres_max_connections - 10_reserved) / pod_count

Пример: max_connections=100, 5 API-подов + 1 worker-под → (100-10)/6 = 15 соединений per pod
```

В `prisma.config.ts`:
```typescript
datasource db {
  url = env("DATABASE_URL")
  // Явно ограничиваем pool — не полагаемся на дефолт Prisma (10)
  connection_limit = env("DB_POOL_SIZE")  // задаётся через Helm values per-env
}
```

Мониторинг: алерт при `pg_stat_activity WHERE state='active' > 80%` от `max_connections`.

### Batch queries вместо N+1

**Запрещено** в analytics-сервисах:

```typescript
// ✗ ЗАПРЕЩЕНО — N параллельных запросов через одно соединение транзакции
const results = await Promise.all(
  items.map(item => getCumulativeFact(item.workLineageId, tx))
);

// ✓ ТРЕБУЕТСЯ — один SQL с GROUP BY
const cumulativeMap = await getCumulativeFactsBatch(lineageIds, tx);
```

Правило: любой цикл по `workItems` с `await tx.$queryRaw` внутри → обязательный ревью-коммент с обоснованием.

### Ограничения по времени транзакций

| Операция | SLA транзакции | Действие при превышении |
|---------|---------------|------------------------|
| `closePeriod` | ≤ 3 сек | Alert; расследование индексов |
| `calcReadiness` (внутри closePeriod) | ≤ 2 сек | Alert; проверить batch queries |
| `openPeriod` (advisory lock) | ≤ 5 сек (lock_timeout) | `PERIOD_LOCK_TIMEOUT` |

## SLA Worker vs API — разделение ролей

Recovery scan (ADR-005) и SLA-обработка выполняются **только** в `ROLE=worker` процессе:

```typescript
// sla-scheduler.service.ts
async onModuleInit(): Promise<void> {
  if (process.env.ROLE !== 'worker' && process.env.ENABLE_SLA_RECOVERY !== 'true') {
    return;  // API-поды не участвуют в recovery scan
  }
  // ... recovery scan
}
```

В production: SLA-worker — отдельный K8s Deployment (ADR-005). В dev — один процесс с `ENABLE_SLA_RECOVERY=true`.

## Multi-tenancy (отложено → ADR-012)

Multi-tenancy не реализован в v1.0. Решение (RLS vs `organization_id` в WHERE) зафиксировано в ADR-012 до начала backend-разработки. Prisma-слой не должен строить предположений о будущей модели: все `findMany` уже фильтруют по `objectId` или `organizationId`.

## Ограничения инфраструктуры (обязательно к исполнению)

### Connection Pooler

`pg_advisory_xact_lock` (ADR-002) привязан к конкретному backend-процессу PostgreSQL. При смене соединения блокировка молча снимается.

**Требование:** connection pooler ДОЛЖЕН работать в режиме **session pooling**, НЕ transaction pooling.

| Pooler | Допустимая конфигурация |
|--------|------------------------|
| PgBouncer | `pool_mode = session` |
| Supavisor (Supabase) | session mode |
| AWS RDS Proxy | **Запрещён** — не поддерживает session-level advisory locks |
| Без pooler (прямое соединение) | Допустимо |

Нарушение этого требования полностью нейтрализует защиту ADR-002.

### Redis Persistence

```
appendonly yes
appendfsync everysec
```

Без AOF потеря Redis = потеря всех незапланированных SLA-событий (компенсируется recovery scan ADR-005, но только при штатном рестарте).
