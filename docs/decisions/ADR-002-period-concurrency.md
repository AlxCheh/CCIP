# ADR-002 — Конкурентное открытие периодов

**Статус:** Принято (rev 2 — 2026-04-25)  
**Дата:** 2026-04-24  
**Риск:** R-02

## Проблема

Два SC одновременно вызывают `OpenPeriod()` на одном объекте → оба читают `MAX(period_number) = N` → race condition на вставке следующего периода.

## Решение

Двухслойная защита внутри одной транзакции:

**Слой 1 (основной): `pg_advisory_xact_lock`**  
Блокирует конкурентное выполнение на уровне объекта.

**Слой 2 (fallback): `UNIQUE(object_id, period_number)`**  
Если advisory lock обойдён — БД отклонит дубль с ошибкой constraint.

## Контракт реализации

```typescript
// period.service.ts
async openPeriod(objectId: string, actorId: string): Promise<Period> {
  return this.prisma.$transaction(async (tx) => {
    // 1. Advisory lock: UUID → bigint через md5 (стабилен между версиями PostgreSQL)
    //    hashtext() НЕ используется — его результат может меняться при мажорном апгрейде PG.
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        ('x' || left(md5(${objectId}), 16))::bit(64)::bigint
      )
    `;

    // 2. Бизнес-проверки
    const zeroReport = await tx.zeroReports.findFirst({
      where: { objectId, status: 'approved' },
    });
    if (!zeroReport) throw new ForbiddenException('ZERO_REPORT_NOT_APPROVED');

    const openPeriod = await tx.periods.findFirst({
      where: { objectId, status: 'open' },
    });
    if (openPeriod) throw new ConflictException('PERIOD_ALREADY_OPEN');

    // 3. Безопасное чтение следующего номера
    const last = await tx.periods.findFirst({
      where: { objectId },
      orderBy: { periodNumber: 'desc' },
    });

    return tx.periods.create({
      data: {
        objectId,
        periodNumber: (last?.periodNumber ?? 0) + 1,
        status: 'open',
        openedBy: actorId,
        openedAt: new Date(),
      },
    });
  }, { isolationLevel: 'ReadCommitted' });
}
```

## Обработка ошибок и UX-retry

```typescript
// period.service.ts
} catch (err) {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err?.message?.includes('lock timeout')
  ) {
    throw new ConflictException('PERIOD_LOCK_TIMEOUT');
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new ConflictException('PERIOD_ALREADY_EXISTS');
  }
  throw err;
}
```

**UX-контракт при `PERIOD_LOCK_TIMEOUT`:**

Клиент (Web / Mobile) реализует exponential backoff:
- Попытка 1: немедленно (первичный запрос)
- Попытка 2: через 1 секунду
- Попытка 3: через 3 секунды
- После 3 неудач: диалог *«Период открывается другим SC. Обновите страницу через несколько секунд.»*

```typescript
// period.api.ts (frontend)
async openPeriodWithRetry(objectId: string): Promise<Period> {
  const delays = [1000, 3000];

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await api.post(`/periods/open`, { objectId });
    } catch (err) {
      if (err.code === 'PERIOD_LOCK_TIMEOUT' && attempt < delays.length) {
        await sleep(delays[attempt]);
        continue;
      }
      if (err.code === 'PERIOD_ALREADY_OPEN') {
        // Другой SC уже открыл — обновляем данные, не показываем ошибку
        return await api.get(`/periods/current/${objectId}`);
      }
      throw err;
    }
  }
  throw new Error('PERIOD_OPEN_FAILED_AFTER_RETRIES');
}
```

## Идемпотентность offline open_period

ADR-008 разрешает `open_period` офлайн через sync_queue. Проблема: SC нажал кнопку несколько раз офлайн, не понял что поставлено в очередь. Дубли в sync_queue.

Контракт: при добавлении `open_period` в локальную очередь проверяется наличие уже существующего pending-запроса:

```typescript
// sync-manager.ts (Mobile)
async queueOpenPeriod(objectId: string): Promise<void> {
  await localDb.write(async () => {
    const existing = await localDb.syncQueue
      .query(
        Q.where('operation', 'open_period'),
        Q.where('object_id', objectId),
        Q.where('status', 'pending'),
      )
      .fetchOne();

    if (existing) {
      // Обновляем timestamp — не создаём дубль
      await existing.update(e => e.clientTimestamp = Date.now());
    } else {
      await localDb.syncQueue.create(entry => {
        entry.operation = 'open_period';
        entry.payload = { objectId };
        entry.status = 'pending';
        entry.clientTimestamp = Date.now();
        entry.lastKnownVersion = null;
      });
    }
  });
}
```

## Почему md5, а не hashtext

`hashtext()` — внутренняя функция PostgreSQL; документация предупреждает, что результат может меняться между мажорными версиями. При апгрейде PG16 → PG17 хэши изменятся, что приведёт к несоответствию lock-ключей.

`md5()` — стандартная функция, стабильна. `left(md5(uuid), 16)` → 64-битное пространство (2^64 против 2^32 у hashtext).

| Число объектов | hashtext (32 бит) | md5-based (64 бит) |
|---------------|------------------|-------------------|
| 1 000 | ~0.01% | ~0.000000003% |
| 10 000 | ~1.2% | ~0.00000003% |
| 100 000 | ~69% ⚠️ | ~0.0000003% |

## Требование к connection pooler

Advisory lock привязан к backend-процессу PostgreSQL. Работает **только** при session pooling.  
Подробности — в ADR-001, раздел «Ограничения инфраструктуры».
