# ADR-002 — Конкурентное открытие периодов

**Статус:** Принято rev 2
**Закрытый риск:** R-02

## Решение
Двухслойная защита: `pg_advisory_xact_lock` (основной) + `UNIQUE(object_id, period_number)` (fallback).

## Контекст
Два SC одновременно вызывают `OpenPeriod()` на одном объекте → оба читают `MAX(period_number) = N` → race condition на вставке. `last-write-wins` недопустим архитектурно.

## Практический кейс
SC-A и SC-B одновременно открывают период объекта «Склад». Advisory lock на hash от `object_id` гарантирует, что только один пройдёт. SC-B получает `PERIOD_LOCK_TIMEOUT` и клиент делает retry через 1 с, затем 3 с. Если один SC уже успел открыть — `PERIOD_ALREADY_OPEN` → клиент читает существующий период.

## Контракт реализации

Lock внутри транзакции `ReadCommitted`:
```sql
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(('x' || left(md5(:objectId), 16))::bit(64)::bigint);
```
`md5()` — стабилен между мажорными версиями PG. `hashtext()` запрещён — результат меняется при апгрейде PG.

Бизнес-проверки после lock: `zeroReport.status = 'approved'`; нет открытого периода.

**Ошибки:** `lock timeout` → `PERIOD_LOCK_TIMEOUT`; Prisma P2002 → `PERIOD_ALREADY_EXISTS`.

**UX-retry на клиенте:** попытка 1 — немедленно; попытка 2 — через 1 с; попытка 3 — через 3 с. После 3 неудач — диалог. `PERIOD_ALREADY_OPEN` → не ошибка, читаем текущий период.

**Офлайн-идемпотентность:** при добавлении `open_period` в `sync_queue` проверяется pending-запись для того же `object_id`. Если существует — обновляем `clientTimestamp`, не создаём дубль.

**Connection pooler:** session pooling обязателен (ADR-001). При transaction pooling advisory lock молча снимается при смене соединения.

## Отклонённые альтернативы
| Альтернатива | Причина |
|---|---|
| Только `UNIQUE` constraint | Не предотвращает гонку чтения `MAX(period_number)` |
| `SELECT FOR UPDATE` на объекте | Блокирует чтение объекта другими; advisory lock точнее |
| `hashtext()` | Нестабилен между мажорными версиями PostgreSQL |
