# ADR-004 — Дрейф Materialized View

**Статус:** Принято rev 2
**Закрытый риск:** R-04

## Решение
BullMQ retry (3 попытки, exponential backoff) + `mv_refresh_log.is_stale` флаг + self-healing cron каждые 5 минут + ручной Admin refresh.

## Контекст
`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_object_current_status` вызывается после `closePeriod`. При сбое директор видит устаревший дашборд без предупреждения. `is_stale` должен выставляться через ~35 сек после сбоя, не через 2 часа.

## Практический кейс
После закрытия периода refresh упал. BullMQ: попытка 2 через 5 с, попытка 3 через 10 с — суммарно ~35 сек. После exhausted retries: `is_stale=TRUE`, уведомление Admin, баннер на дашборде. Self-healing cron каждые 5 мин проверяет `is_stale` и пробует refresh — Auto-recovery без Admin. После успеха `is_stale=FALSE`, баннер исчезает.

## Контракт реализации

**P-20:** `mv_refresh_log(view_name VARCHAR(100) PK, refreshed_at TIMESTAMPTZ, period_id VARCHAR(50), is_stale BOOLEAN DEFAULT FALSE)`

**BullMQ job:** `jobId: 'refresh-mv-{periodId}'`, `attempts: 3`, `backoff: {type: 'exponential', delay: 5000}`, `removeOnComplete: true`, `removeOnFail: false`. Deduplication: повторный вызов с тем же `jobId` — no-op.

**Exhausted retries:** `UPDATE mv_refresh_log SET is_stale=TRUE` + `notifyAdmin(type: 'mv_refresh_failed')`.

**Self-healing cron:** BullMQ repeatable job `jobId: 'refresh-mv-self-healing'`, `repeat: {every: 5*60*1000}`. Проверяет `is_stale`; если `true` — REFRESH; при повторной ошибке — `notifyAdminThrottled('mv_refresh_failed', 30*60*1000)`.

**Manual refresh Admin:** `POST /admin/refresh-dashboard`, `jobId: 'refresh-mv-manual'` (без `Date.now()` — deduplication корректна).

**UI staleness:** `isStale = mv_refresh_log.is_stale OR differenceInMinutes(now, refreshedAt) > 30`. Баннер: «Данные обновлены X минут назад — обратитесь к администратору».

**`refreshed_at`** хранится в `mv_refresh_log`, не в MV (технически невозможно при CONCURRENT refresh).

## Отклонённые альтернативы
| Альтернатива | Причина |
|---|---|
| Sync refresh в транзакции closePeriod | CONCURRENT refresh нельзя выполнить в транзакции |
| Cron без retry | Нет гарантии порядка; retry не привязан к событию периода |
| Алерт только через 2 ч | Директор увидит устаревшие данные слишком долго |
