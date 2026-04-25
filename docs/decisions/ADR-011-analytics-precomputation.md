# ADR-011 — Стратегия предвычисления аналитики

**Статус:** Принято  
**Дата:** 2026-04-25  
**Риск:** R-11

## Проблема

Дашборд директора и карточка объекта показывают:
- `obj_readiness` = Σ(pct_ready × weight_coef) — взвешенный % готовности объекта
- `weighted_forecast_date` — прогноз завершения через WMA
- `critical_path_forecast_date` — прогноз по критическому пути
- `gap_flag` — флаг разрыва прогнозов
- WMA-темп по каждой позиции (`work_pace`)

Все эти значения требуют JOIN через `work_lineage_id` (ADR-006), агрегации по всем закрытым периодам и применения формул с L0-параметрами (decay_factor, avg_pace_periods, weight_threshold, и т.д.).

При **live-расчёте** на каждый GET-запрос: 50 позиций × 50 периодов × JOIN по lineage = O(2500) строк per объект, per запрос. При 20+ объектах на дашборде директора — нагрузка неприемлема.

## Решение

**Pre-computed при закрытии периода.** Все аналитические значения рассчитываются синхронно в транзакции закрытия периода и сохраняются в `work_pace` и `readiness_snapshots`. Дашборд читает из `mv_object_current_status` (материализованного представления над `readiness_snapshots`).

```
ClosePeriod()
  └── CalcReadiness(periodId)               ← синхронно, в той же транзакции
        ├── UPDATE work_pace (WMA per item)
        ├── INSERT readiness_snapshots
        └── REFRESH MV CONCURRENTLY         ← после commit транзакции (ADR-004)
```

## Контракт CalcReadiness

```typescript
// analytics.service.ts
async calcReadiness(periodId: string, tx: Prisma.TransactionClient): Promise<void> {
  const period = await tx.periods.findUniqueOrThrow({
    where: { id: periodId },
    include: { object: true },
  });

  const config = await this.configService.getAll(tx); // L0-параметры

  // 1. WMA темп по каждой позиции
  const workItems = await tx.periodFacts.findMany({
    where: { periodId },
    include: { boqItem: true },
  });

  for (const fact of workItems) {
    const history = await tx.workPace.findMany({
      where: {
        boqItemId: fact.boqItemId,
        isExcluded: false,
      },
      orderBy: { period: { periodNumber: 'desc' } },
      take: config.avg_pace_periods,
    });

    const wma = calcWMA(
      history.map(h => h.periodVolume),
      config.decay_factor,
    );

    await tx.workPace.create({
      data: {
        periodId,
        boqItemId: fact.boqItemId,
        periodVolume: fact.acceptedVolume ?? 0,
        weightedPace: wma,
        isExcluded: false,  // плановые паузы помечает SC отдельно
      },
    });
  }

  // 2. pct_ready по каждой позиции (через work_lineage_id — ADR-006)
  const readinessPerItem = await Promise.all(
    workItems.map(async (fact) => {
      const cumulative = await this.analyticsService.getCumulativeFact(
        fact.boqItem.workLineageId,
        tx,
      );
      return {
        pctReady: Math.min((cumulative / fact.boqItem.planVolume) * 100, 100),
        weightCoef: fact.boqItem.weightCoef,
        isCritical: fact.boqItem.isCritical,
        workLineageId: fact.boqItem.workLineageId,
      };
    }),
  );

  // 3. Взвешенный % готовности объекта
  const objReadiness = readinessPerItem.reduce(
    (sum, item) => sum + item.pctReady * item.weightCoef,
    0,
  );

  // 4. Два прогноза
  const weightedForecast = calcWeightedForecast(readinessPerItem, config);
  const criticalPathForecast = calcCriticalPathForecast(readinessPerItem, config);
  const gapFlag = differenceInPeriods(criticalPathForecast, weightedForecast) >= config.forecast_gap_alert;

  // 5. Сохраняем снимок
  await tx.readinessSnapshots.create({
    data: {
      periodId,
      objectId: period.objectId,
      objectReadinessPct: objReadiness,
      weightedForecastDate: weightedForecast,
      criticalPathForecastDate: criticalPathForecast,
      gapFlag,
      calculatedAt: new Date(),
    },
  });
  // REFRESH MV — вызывается после commit (ADR-004, вне транзакции)
}
```

## Интеграция с ClosePeriod

```typescript
// period.service.ts
async closePeriod(periodId: string, actorId: string): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    const period = await tx.periods.findUniqueOrThrow({ where: { id: periodId } });

    if (period.status !== 'open') throw new ConflictException('PERIOD_NOT_OPEN');

    const openDisputes = await tx.discrepancies.count({
      where: { periodId, status: 'open' },
    });
    if (openDisputes > 0) throw new ConflictException('OPEN_DISPUTES_EXIST');

    await tx.periods.update({
      where: { id: periodId },
      data: { status: 'closed', closedBy: actorId, closedAt: new Date() },
    });

    // Синхронный пересчёт — до конца транзакции
    await this.analyticsService.calcReadiness(periodId, tx);
  });

  // REFRESH MV — вне транзакции (ADR-004)
  await this.analyticsService.refreshDashboard(periodId);
}
```

## Почему синхронный расчёт, а не фоновый job

| Подход | Проблема |
|--------|---------|
| Async job (BullMQ) | `readiness_snapshots` пуст сразу после закрытия; директор видит дашборд без нового снимка до завершения job |
| **Синхронный в транзакции (принято)** | Снимок создан до `periods.status='closed'` — к моменту, когда дашборд обновится, данные уже есть |

Риск: CalcReadiness занимает N секунд → ClosePeriod медленный. Митигация: `work_pace` индексирован (`idx_work_pace_item_period WHERE is_excluded=FALSE`), `idx_boq_items_lineage` ускоряет cumulative join. При 50 позициях × 50 периодов — расчёт занимает <1 секунды.

## Admin-корректировка и пересчёт

При Admin-корректировке `period_facts` закрытого периода (ADR-007) — `readiness_snapshots` для этого периода устаревает. После корректировки вызывается:

```typescript
await this.analyticsService.recalcSnapshot(periodId);
// Пересоздаёт readiness_snapshots для periodId + REFRESH MV
```

Последующие периоды **не пересчитываются** автоматически — ретроактивный пересчёт всей цепочки требует явного решения Admin. Это ограничение, зафиксированное в §10.3 (каскадный пересчёт при CorrectZeroReport).

## Инварианты

- `readiness_snapshots` всегда создаётся в транзакции `closePeriod` — нет закрытого периода без снимка.
- Дашборд директора читает только из `mv_object_current_status` — не из live-запросов к `period_facts`.
- WMA использует только записи `work_pace.is_excluded = FALSE` — плановые паузы исключены из расчёта.
- `pct_ready` ограничен 100% на уровне позиции: `MIN(cumulative_fact / plan_volume × 100, 100)`.
- `SUM(weight_coef) == 1.0` гарантирован триггером `trg_boq_items_weight_coef` — `obj_readiness` корректен без нормализации.
- После Admin-корректировки `recalcSnapshot()` вызывается явно — snapshot обновляется немедленно.
