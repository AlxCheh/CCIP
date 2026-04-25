# ADR-001 — Backend Framework

**Статус:** Принято  
**Дата:** 2026-04-24  
**Риск:** R-01

## Решение

**NestJS (TypeScript) + Prisma + Redis/BullMQ**

## Обоснование

| Фактор | Решающий аргумент |
|--------|-------------------|
| SLA Scheduler | BullMQ: distributed lock, job deduplication, K8s-ready из коробки. APScheduler требует кастомного Redis-lock для тех же гарантий |
| Единый стек | TypeScript на всех уровнях (React Web + React Native + Backend) — shared DTO/types без кодогенерации |
| Модульный монолит | NestJS Module = CCIP Module 1:1 (Init, ZeroReport, PeriodEngine, Dispute, Analytics, OfflineSync) |
| RBAC | Guards + Decorators декларативно покрывают матрицу §8.2 |

## Отклонённые альтернативы

**FastAPI (Python):** предпочтительнее если ML-pipeline планируется в первые 12 месяцев или команда без TypeScript-опыта. APScheduler + кастомный redlock — рабочий, но более трудоёмкий путь для R-05.

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

## Ограничения инфраструктуры (обязательно к исполнению)

### Connection Pooler

`pg_advisory_xact_lock` (используемый в ADR-002) привязан к конкретному backend-процессу PostgreSQL. При смене соединения внутри транзакции блокировка молча снимается.

**Требование:** connection pooler ДОЛЖЕН работать в режиме **session pooling**, НЕ transaction pooling.

| Pooler | Допустимая конфигурация |
|--------|------------------------|
| PgBouncer | `pool_mode = session` |
| Supavisor (Supabase) | session mode |
| AWS RDS Proxy | **Запрещён** — не поддерживает session-level advisory locks |
| Без pooler (прямое соединение) | Допустимо |

Нарушение этого требования полностью нейтрализует защиту ADR-002.

### Redis Persistence

Redis должен быть настроен с AOF-персистентностью — требование ADR-005.

```
appendonly yes
appendfsync everysec
```

Без AOF потеря Redis = потеря всех незапланированных SLA-событий.
