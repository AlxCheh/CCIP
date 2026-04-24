# ADR-005 — SLA Scheduler: надёжность и идемпотентность

**Статус:** Принято  
**Дата:** 2026-04-24  
**Риск:** R-05

## Проблема

SLA-таймеры (deadlock A: день 3/5, deadlock B: день 7/14) — критичные бизнес-события. Scheduler нельзя запустить в >1 реплики без distributed lock. При краше единственного пода — события могут опоздать или выполниться дважды при restart.

## Решение

**BullMQ `jobId` (deduplication) + идемпотентная проверка `executedAt` в БД + K8s `Recreate` strategy.**

## Контракт планирования события

```typescript
await this.slaQueue.add(
  event.eventType,
  { slaEventId: event.id, scenario: event.scenario },
  {
    delay,
    jobId: `sla-${event.id}`,   // BullMQ не добавит дубль если job уже существует
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: true,
    removeOnFail: false,
  }
);
```

## Контракт воркера

```typescript
async handle(job: Job): Promise<void> {
  const event = await prisma.slaEvents.findUnique({ where: { id: job.data.slaEventId } });
  if (event.executedAt) return; // идемпотентная защита от повторного выполнения

  await prisma.$transaction(async (tx) => {
    await executeEvent(tx, event);   // бизнес-логика (notify / force_close)
    await tx.slaEvents.update({
      where: { id: event.id },
      data: { executedAt: new Date() },
    });
  });
}
```

## K8s Deployment

```yaml
replicas: 1
strategy:
  type: Recreate   # НЕ RollingUpdate: при rolling update два пода живут одновременно
```

Liveness probe: проверка Redis-соединения каждые 30s.

## Гарантии

| Сценарий | Защита |
|----------|--------|
| Два пода запустились одновременно | `jobId` deduplication в BullMQ |
| Pod упал, поднялся заново | `attempts: 3` + `executedAt` — повтор безопасен |
| Redis упал | Job persists в Redis (AOF/RDB); при восстановлении обрабатывается |
| Событие выполнилось дважды | `if (event.executedAt) return` — второй вызов no-op |

## Мониторинг

Failed jobs (`removeOnFail: false`) видны в Bull Dashboard. Настроить алерт при `failed count > 0` в очереди `sla`.
