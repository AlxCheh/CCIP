# ADR-004 — Дрейф Materialized View

**Статус:** Принято (rev 2 — 2026-04-25)  
**Дата:** 2026-04-24  
**Риск:** R-04

## Проблема

`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_object_current_status` вызывается после закрытия периода. При сбое refresh — директор видит устаревший дашборд без каких-либо признаков этого.

## Решение

Три слоя: **retry через BullMQ** + **таблица `mv_refresh_log`** + **немедленный staleness-флаг при исчерпании попыток** + **self-healing cron** для автовосстановления без участия Admin.

## Патч схемы БД

```sql
-- P-20 (уже применён)
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
  await this.prisma.$executeRaw`
    UPDATE mv_refresh_log
    SET is_stale = TRUE
    WHERE view_name = 'mv_object_current_status'
  `;

  await this.notificationsService.notifyAdmin({
    type: 'mv_refresh_failed',
    message: `Дашборд директора устарел: обновление провалилось после 3 попыток (period_id: ${job.data.periodId})`,
  });
}
```

## Self-healing Cron

При исчерпании retry без вмешательства Admin MV остаётся stale indefinitely — до следующего `closePeriod`. Self-healing cron устраняет это:

```typescript
// analytics.service.ts — BullMQ repeatable job, регистрируется при старте
async registerSelfHealingCron(): Promise<void> {
  await this.refreshQueue.add(
    'refresh-mv-health',
    { source: 'cron' },
    {
      jobId: 'refresh-mv-self-healing',   // фиксированный jobId — no-op при повторной регистрации
      repeat: { every: 5 * 60 * 1000 },  // каждые 5 минут
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
}

// Обработчик self-healing cron
async handleSelfHealingRefresh(): Promise<void> {
  const log = await this.prisma.$queryRaw<MvRefreshLog[]>`
    SELECT is_stale FROM mv_refresh_log WHERE view_name = 'mv_object_current_status'
  `;

  if (!log[0]?.isStale) return;  // всё в порядке — ничего не делаем

  this.logger.warn('Self-healing: MV is stale, attempting refresh');

  try {
    await this.prisma.$executeRaw`
      REFRESH MATERIALIZED VIEW CONCURRENTLY mv_object_current_status
    `;
    await this.prisma.$executeRaw`
      UPDATE mv_refresh_log SET is_stale = FALSE, refreshed_at = NOW()
      WHERE view_name = 'mv_object_current_status'
    `;
    this.logger.log('Self-healing: MV refresh successful, staleness cleared');
  } catch (err) {
    this.logger.error('Self-healing: MV refresh still failing', err);
    // Уведомление Admin повторяем только если прошло > 30 мин с последнего уведомления
    await this.notificationsService.notifyAdminThrottled('mv_refresh_failed', 30 * 60 * 1000);
  }
}
```

## Ручной refresh (Admin)

```typescript
// admin.controller.ts — POST /admin/refresh-dashboard
async manualRefresh(): Promise<void> {
  // Фиксированный jobId — повторный клик Admin это no-op (deduplication)
  await this.refreshQueue.add('refresh-mv', { source: 'manual' }, {
    jobId: 'refresh-mv-manual',   // без Date.now() — deduplication корректна
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
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
  const isStale =
    meta.isStale ||
    differenceInMinutes(new Date(), meta.refreshedAt) > 30;

  return {
    refreshedAt: meta.refreshedAt,
    isStale,
    // minutesAgo — для баннера «Данные обновлены X минут назад»
    minutesAgo: differenceInMinutes(new Date(), meta.refreshedAt),
  };
}
```

Если `isStale = true` — баннер на дашборде директора: *«Данные обновлены X минут назад — обратитесь к администратору»*

## Инварианты

- `is_stale` выставляется немедленно при exhausted retries (~35 сек), не через 2 часа.
- Self-healing cron каждые 5 мин проверяет `is_stale` и пробует refresh — Auto-recovery без Admin.
- Retry не запускается повторно, если job с тем же `jobId` уже в очереди (BullMQ deduplication).
- Manual refresh использует фиксированный jobId `refresh-mv-manual` — повторный клик Admin это no-op.
- После успешного refresh `is_stale = FALSE` — баннер исчезает автоматически.
- `refreshed_at` хранится в `mv_refresh_log`, НЕ в самом MV (технически невозможно при CONCURRENT refresh).
