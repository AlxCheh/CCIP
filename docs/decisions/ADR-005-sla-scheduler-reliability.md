# ADR-005 — SLA Scheduler: надёжность и идемпотентность

**Статус:** Принято (rev 2 — 2026-04-25)  
**Дата:** 2026-04-24  
**Риск:** R-05

## Проблема

SLA-таймеры (deadlock A: день 3/5, deadlock B: день 7/14) — критичные бизнес-события. Scheduler нельзя запустить в >1 реплики без distributed lock. При краше единственного пода — события могут опоздать или выполниться дважды при restart.

Дополнительный риск: при потере Redis (flush, миграция окружения, первый деплой) BullMQ теряет все отложенные jobs. Записи в `sla_events` остаются в PostgreSQL, но без соответствующих jobs в очереди они никогда не выполнятся — **orphaned SLA events**.

## Решение

**BullMQ `jobId` (deduplication) + идемпотентная проверка `executedAt` в БД + recovery scan при старте + K8s `Recreate` strategy.**

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
// sla.worker.ts
const worker = new Worker('sla', async (job: Job) => {
  const event = await prisma.slaEvents.findUnique({ where: { id: job.data.slaEventId } });
  if (!event || event.executedAt) return; // идемпотентная защита от повторного выполнения

  await prisma.$transaction(async (tx) => {
    await executeEvent(tx, event);   // бизнес-логика (notify / force_close)
    await tx.slaEvents.update({
      where: { id: event.id },
      data: { executedAt: new Date() },
    });
  });
}, {
  connection: redis,
  // lockDuration должен превышать terminationGracePeriodSeconds K8s (default 30s).
  // Если pod убит в момент обработки — новый worker не возьмёт job раньше истечения lock,
  // после чего BullMQ помечает его stalled и повторно ставит в очередь.
  // executedAt защищает от двойного исполнения при повторе.
  lockDuration: 60_000,       // 60s
  stalledInterval: 30_000,    // проверка stalled jobs каждые 30s
});
```

## Recovery scan при старте (критично)

При потере Redis все delayed jobs теряются, но `sla_events` в PostgreSQL сохраняются. Без recovery scan — orphaned events никогда не выполнятся.

**ВАЖНО:** Scan выполняется **только** в `ROLE=worker` процессе. Если SLA-worker и API-сервер — один NestJS-монолит, используется env-флаг `ENABLE_SLA_RECOVERY=true`. Это предотвращает параллельное добавление одних и тех же jobs из N API-подов.

```typescript
// sla-scheduler.service.ts
async onModuleInit(): Promise<void> {
  // Пропускаем recovery scan в API-подах
  if (process.env.ROLE !== 'worker' && process.env.ENABLE_SLA_RECOVERY !== 'true') {
    return;
  }

  // Берём ВСЕ неисполненные события — и будущие, и просроченные
  const orphaned = await this.prisma.slaEvents.findMany({
    where: {
      executedAt: null,
      // НЕТ фильтра scheduledAt > NOW() — просроченные события тоже нужно выполнить
    },
  });

  let recovered = 0;
  let overdue = 0;

  for (const event of orphaned) {
    const now = Date.now();
    const scheduledMs = event.scheduledAt.getTime();

    // Просроченные события — выполняем немедленно (delay = 0)
    // Будущие события — выполняем в запланированное время
    const delay = Math.max(0, scheduledMs - now);
    const isOverdue = scheduledMs < now;

    if (isOverdue) {
      overdue++;
      this.logger.warn(`SLA recovery: overdue event ${event.id} (${event.eventType}), scheduled at ${event.scheduledAt.toISOString()}, executing immediately`);
    }

    await this.slaQueue.add(
      event.eventType,
      { slaEventId: event.id, scenario: event.scenario },
      {
        delay,
        jobId: `sla-${event.id}`,   // повторное добавление существующего job — no-op в BullMQ
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    recovered++;
  }

  this.logger.log(`SLA recovery scan: ${recovered} events re-scheduled (${overdue} overdue, executed immediately)`);
}
```

Повторное добавление job с существующим `jobId` в BullMQ безопасно — дубль не создаётся.

## K8s Deployment

```yaml
replicas: 1
strategy:
  type: Recreate   # НЕ RollingUpdate: при rolling update два пода живут одновременно,
                   # jobId deduplication защищает от двойного выполнения,
                   # но два воркера конкурируют за одни jobs — избыточная нагрузка.
                   # Recreate: короткий downtime (~30s) при деплое допустим,
                   # recovery scan при старте компенсирует просроченные события.
spec:
  template:
    spec:
      terminationGracePeriodSeconds: 30   # должен быть < lockDuration (60s)
      containers:
        - name: sla-scheduler
          env:
            - name: ROLE
              value: "worker"
          livenessProbe:
            exec:
              command: ["node", "-e", "require('./dist/health').checkBoth()"]
            initialDelaySeconds: 10
            periodSeconds: 30
            failureThreshold: 3
          readinessProbe:
            exec:
              command: ["node", "-e", "require('./dist/health').checkBoth()"]
            initialDelaySeconds: 5
            periodSeconds: 10
```

Health check `checkBoth()` проверяет **и Redis, и PostgreSQL**. Pod считается живым только при доступности обоих.

## Инфраструктурное требование: Redis AOF

```
# redis.conf — обязательно для production
appendonly yes
appendfsync everysec
```

Без AOF потеря Redis = потеря всех отложенных jobs. Recovery scan при старте компенсирует это для всех событий (и прошедших, и будущих).

## Защита sla_events от случайного DELETE

`sla_events` — источник истины для recovery scan. Случайное или ошибочное удаление = потеря SLA-истории.

```sql
-- P-24 (schema.sql)
-- Триггер запрещает DELETE на уровне БД. Отменить SLA-событие можно только
-- через UPDATE executed_at = NOW() (пометить как выполненное).
CREATE OR REPLACE FUNCTION fn_sla_events_no_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'sla_events: DELETE запрещён. Используйте UPDATE executed_at для отмены события.';
END;
$$;

CREATE TRIGGER trg_sla_events_no_delete
  BEFORE DELETE ON sla_events
  FOR EACH ROW EXECUTE FUNCTION fn_sla_events_no_delete();
```

## Гарантии

| Сценарий | Защита |
|----------|--------|
| Два пода запустились одновременно | `jobId` deduplication в BullMQ |
| Pod упал, поднялся заново | `attempts: 3` + `executedAt` — повтор безопасен |
| Redis потерян полностью | `onModuleInit` recovery scan восстанавливает все `executedAt IS NULL` события |
| Первый деплой / новое окружение | Recovery scan отрабатывает при каждом старте |
| Событие выполнилось дважды | `if (event.executedAt) return` — второй вызов no-op |
| Pod убит в момент обработки | `lockDuration: 60s > terminationGracePeriodSeconds: 30s` — stalled job повторяется безопасно |
| Просроченное событие после рестарта | Recovery scan добавляет с `delay: 0` — выполняется немедленно |
| **[БЫЛО]** Просроченные события не выполнялись | **Исправлено:** убран фильтр `scheduledAt > NOW()` из recovery scan |

## Мониторинг

Failed jobs (`removeOnFail: false`) видны в Bull Dashboard. Настроить алерт при `failed count > 0` в очереди `sla`.

Выполненные jobs (`removeOnComplete: true`) удаляются из Redis — история только в `sla_events.executed_at`. Bull Dashboard не является источником истины для completed events.

Метрика `sla_recovery_overdue_total` (gauge) — количество просроченных событий при каждом recovery scan. Ненулевое значение = pod был мёртв дольше, чем ожидалось.
