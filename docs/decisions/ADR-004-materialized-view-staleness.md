# ADR-004 — Дрейф Materialized View

**Статус:** Принято  
**Дата:** 2026-04-24  
**Риск:** R-04

## Проблема

`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_object_current_status` вызывается после закрытия периода. При сбое refresh — директор видит устаревший дашборд без каких-либо признаков этого.

## Решение

Три слоя: **retry через BullMQ** + **отдельная таблица `mv_refresh_log`** + **немедленный staleness-флаг при исчерпании попыток**.

## Патч схемы БД

```sql
-- Хранит метаданные последнего успешного (и неудачного) refresh MV.
-- refreshed_at НЕ размещается в самом MV: REFRESH заменяет все строки snapshot'ом,
-- нет механизма вставить NOW() как метаданные — только через отдельную таблицу.
CREATE TABLE mv_refresh_log (
    view_name     VARCHAR(100) PRIMARY KEY,
    refreshed_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    period_id     VARCHAR(50),
    is_stale      BOOLEAN      NOT NULL DEFAULT FALSE
);

INSERT INTO mv_refresh_log (view_name, refreshed_at, is_stale)
VALUES ('mv_object_current_status', NOW(), FALSE);
```

## Контракт retry

```typescript
// analytics.service.ts
async refreshDashboard(periodId: string): Promise<void> {
  try {
    await this.prisma.$executeRaw`
      REFRESH MATERIALIZED VIEW CONCURRENTLY mv_object_current_status
    `;

    // Фиксируем успешный refresh и снимаем staleness флаг
    await this.prisma.$executeRaw`
      INSERT INTO mv_refresh_log (view_name, refreshed_at, period_id, is_stale)
      VALUES ('mv_object_current_status', NOW(), ${periodId}, FALSE)
      ON CONFLICT (view_name) DO UPDATE
        SET refreshed_at = NOW(), period_id = ${periodId}, is_stale = FALSE
    `;
  } catch (err) {
    const jobId = `refresh-mv-${periodId}`;
    const existing = await this.refreshQueue.getJob(jobId);

    if (!existing) {
      await this.refreshQueue.add('refresh-mv', { periodId }, {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      });
    }

    this.logger.error('MV refresh failed, queued for retry', { periodId });
  }
}
```

BullMQ: 3 попытки, exponential backoff 5s → 10s → 20s. Суммарное окно ≈ 35 секунд.

## Обработчик исчерпания попыток

```typescript
// analytics.service.ts — вызывается BullMQ при failed job (attempts exhausted)
async onRefreshFailed(job: Job): Promise<void> {
  // Немедленно выставляем staleness флаг — не ждём threshold
  await this.prisma.$executeRaw`
    UPDATE mv_refresh_log
    SET is_stale = TRUE
    WHERE view_name = 'mv_object_current_status'
  `;

  // Уведомление администратору
  await this.notificationsService.notifyAdmin({
    type: 'mv_refresh_failed',
    message: `Дашборд директора устарел: обновление провалилось после 3 попыток (period_id: ${job.data.periodId})`,
  });
}
```

## Контракт UI (staleness)

```typescript
// dashboard.service.ts
async getDashboardMeta(): Promise<DashboardMeta> {
  const log = await this.prisma.$queryRaw<MvRefreshLog[]>`
    SELECT refreshed_at, is_stale FROM mv_refresh_log
    WHERE view_name = 'mv_object_current_status'
  `;

  const meta = log[0];
  // Threshold 30 минут — один период ≈ неделя, 30 мин уже явная аномалия.
  // is_stale = TRUE выставляется немедленно при exhausted retries, не ждёт threshold.
  const isStale =
    meta.isStale ||
    differenceInMinutes(new Date(), meta.refreshedAt) > 30;

  return { refreshedAt: meta.refreshedAt, isStale };
}
```

Если `isStale = true` — показывать баннер на дашборде директора:  
`«Данные обновлены X минут назад — обратитесь к администратору»`

## Manual refresh

```typescript
// admin.controller.ts — POST /admin/refresh-dashboard
async manualRefresh(@Query('periodId') periodId?: string): Promise<void> {
  // Уникальный jobId даже без periodId — deduplication не сломана
  const jobId = `refresh-mv-${periodId ?? 'manual-' + Date.now()}`;
  await this.refreshQueue.add('refresh-mv', { periodId }, {
    jobId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  });
}
```

## Инварианты

- `is_stale` выставляется немедленно при exhausted retries — директор видит баннер в течение ~35 секунд, не через 2 часа
- Retry не запускается повторно если job с тем же `jobId` уже в очереди (BullMQ deduplication)
- После успешного refresh `is_stale = FALSE` — баннер исчезает автоматически
- Ручной trigger refresh доступен Admin через `POST /admin/refresh-dashboard`
- `refreshed_at` хранится в `mv_refresh_log`, НЕ в колонке самого MV (технически невозможно разместить корректно при CONCURRENT refresh)
