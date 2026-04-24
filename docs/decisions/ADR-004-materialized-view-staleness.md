# ADR-004 — Дрейф Materialized View

**Статус:** Принято  
**Дата:** 2026-04-24  
**Риск:** R-04

## Проблема

`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_object_current_status` вызывается после закрытия периода. При сбое refresh — директор видит устаревший дашборд без каких-либо признаков этого.

## Решение

Два слоя: **retry через BullMQ** + **staleness-индикатор на UI**.

## Контракт retry

```typescript
// analytics.service.ts
async refreshDashboard(periodId: string): Promise<void> {
  try {
    await this.prisma.$executeRaw`
      REFRESH MATERIALIZED VIEW CONCURRENTLY mv_object_current_status
    `;
  } catch (err) {
    await this.refreshQueue.add('refresh-mv', { periodId }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
    this.logger.error('MV refresh failed, queued for retry', { periodId });
  }
}
```

BullMQ: 3 попытки, exponential backoff 5s → 10s → 20s. Если все три провалились — alert в `notifications` администратору.

## Контракт схемы

`mv_object_current_status` должна содержать колонку `refreshed_at TIMESTAMPTZ`.  
Если в схеме отсутствует — добавить патч P-19.  
`readiness_snapshots.calculated_at` — проверить наличие, добавить если нет.

## Контракт UI (staleness)

```typescript
const isStale = differenceInHours(new Date(), mv.refreshedAt) > 2;
// Порог 2ч: один период ≈ неделя, поэтому 2ч — явная аномалия
```

Если `isStale = true` — показывать баннер на дашборде директора:  
`«Данные обновлены X часов назад — обратитесь к администратору»`

## Инварианты

- Retry не запускается повторно если предыдущий job ещё в очереди (BullMQ job deduplication по `periodId`)
- После успешного retry `refreshed_at` обновляется — баннер исчезает автоматически
- Ручной trigger refresh доступен Admin через `POST /admin/refresh-dashboard`
