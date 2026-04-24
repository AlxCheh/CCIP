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

ORM: Prisma (миграции через `prisma migrate dev`; schema генерируется из существующего `schema.sql`).
