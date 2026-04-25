# ADR-002 — Конкурентное открытие периодов

**Статус:** Принято  
**Дата:** 2026-04-24  
**Риск:** R-02

## Проблема

Два SC одновременно вызывают `OpenPeriod()` на одном объекте → оба читают `MAX(period_number) = N` → race condition на вставке следующего периода.

## Решение

Двухслойная защита внутри одной транзакции:

**Слой 1 (основной): `pg_advisory_xact_lock`**  
Блокирует конкурентное выполнение на уровне объекта. Lock живёт ровно до конца транзакции — явный unlock не нужен.

**Слой 2 (fallback): `UNIQUE(object_id, period_number)`**  
Уже присутствует в схеме. Если advisory lock обойдён — БД отклонит дубль с ошибкой constraint.

## Контракт реализации

```typescript
// period.service.ts
async openPeriod(objectId: string, actorId: string): Promise<Period> {
  return this.prisma.$transaction(async (tx) => {
    // 1. Advisory lock: UUID → bigint через md5 (стабилен между версиями PostgreSQL)
    //    hashtext() НЕ используется — его результат может меняться при мажорном апгрейде PG.
    //    pgcrypto уже подключён в schema.sql (gen_random_uuid).
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        ('x' || left(md5(${objectId}), 16))::bit(64)::bigint
      )
    `;

    // 2. Бизнес-проверки (§3.3)
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
    // Advisory lock снимается здесь автоматически
  }, {
    // Изолируем транзакцию чтобы lock_timeout не утёк в соседние запросы
    isolationLevel: 'ReadCommitted',
  });
}
```

## Обработка ошибок на уровне сервиса

```typescript
// period.service.ts — обёртка вокруг openPeriod
} catch (err) {
  // Prisma оборачивает PostgreSQL lock timeout в PrismaClientKnownRequestError (P2010)
  if (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err?.message?.includes('lock timeout')
  ) {
    throw new ConflictException('PERIOD_LOCK_TIMEOUT');
  }
  // UNIQUE constraint violation — fallback слой сработал
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new ConflictException('PERIOD_ALREADY_EXISTS');
  }
  throw err;
}
```

| Ошибка PostgreSQL | Причина | Ответ клиенту |
|-------------------|---------|---------------|
| `lock timeout exceeded` | Второй SC ждал >5s | 409 + `PERIOD_LOCK_TIMEOUT` → UI предлагает повторить |
| `unique constraint violation` | Fallback сработал | 409 + `PERIOD_ALREADY_EXISTS` |

## Почему md5, а не hashtext

`hashtext()` — внутренняя функция PostgreSQL. Документация явно предупреждает: результат может меняться между мажорными версиями. При апгрейде PG16 → PG17 хэши изменятся, что приведёт к несоответствию lock-ключей и временной потере защиты.

`md5()` — стандартная криптографическая функция, стабильна между версиями. `left(md5(uuid), 16)` даёт 64-битное пространство (2^64 возможных значений) против 2^32 у `hashtext`, что снижает вероятность коллизий.

**Вероятность коллизии (birthday paradox):**

| Число объектов | hashtext (32 бит) | md5-based (64 бит) |
|---------------|------------------|-------------------|
| 1 000 | ~0.01% | ~0.000000003% |
| 10 000 | ~1.2% | ~0.00000003% |
| 100 000 | ~69% ⚠️ | ~0.0000003% |

## Требование к connection pooler

Advisory lock привязан к backend-процессу PostgreSQL. Работает **только** при session pooling.  
Подробности — в ADR-001, раздел «Ограничения инфраструктуры».
