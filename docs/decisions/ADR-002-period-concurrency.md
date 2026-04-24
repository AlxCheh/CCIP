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
    // 1. Advisory lock: UUID → bigint через hashtext
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${objectId})::bigint)`;

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
  });
}
```

## Обработка ошибок на уровне сервиса

| Ошибка PostgreSQL | Причина | Ответ клиенту |
|-------------------|---------|---------------|
| `lock timeout exceeded` | Второй SC ждал >5s | 409 + `PERIOD_LOCK_TIMEOUT` → UI предлагает повторить |
| `unique constraint violation` | Fallback сработал | 409 + `PERIOD_ALREADY_EXISTS` |

## Почему `hashtext`, а не прямой cast

`object_id` — UUID (16 байт). `pg_advisory_xact_lock` принимает `bigint` (8 байт). Прямой `::bigint` невозможен. `hashtext()` даёт стабильный детерминированный хэш; коллизии на масштабе тысяч объектов пренебрежимо малы.
