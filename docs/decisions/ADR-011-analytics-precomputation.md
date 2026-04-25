# ADR-011 — Стратегия предвычисления аналитики

**Статус:** Принято (rev 2 — 2026-04-25)  
**Дата:** 2026-04-25  
**Риск:** R-11

## Проблема

Дашборд директора и карточка объекта показывают:
- `obj_readiness` = Σ(pct_ready × weight_coef) — взвешенный % готовности объекта
- `weighted_forecast_date` — прогноз завершения через WMA
- `critical_path_forecast_date` — прогноз по критическому пути
- `gap_flag` — флаг разрыва прогнозов
- WMA-темп по каждой позиции (`work_pace`)

При **live-расчёте** на каждый GET-запрос: 80 позиций × 50 периодов × JOIN по lineage = O(4000) строк per объект. При 20+ объектах на дашборде директора — нагрузка неприемлема.

## Решение

**Pre-computed при закрытии периода.** Все аналитические значения рассчитываются синхронно **в транзакции** закрытия периода и сохраняются в `work_pace` и `readiness_snapshots`. Дашборд читает из `mv_object_current_status`.

```
ClosePeriod() [транзакция]
  ├── UPDATE periods.status = 'closed'
  └── CalcReadiness(periodId, tx)       ← синхронно, в той же транзакции
        ├── UPDATE work_pace (WMA per item)
        └── INSERT readiness_snapshots   ← snapshot создан до commit!

[после commit транзакции — ADR-004]
  └── REFRESH MV CONCURRENTLY
```

**Гарантия «нет закрытого периода без снимка»** обеспечивается тем, что `calcReadiness` вызывается внутри той же транзакции. Если `calcReadiness` упадёт — вся транзакция откатится, период не закроется.

## Контракт CalcReadiness

```typescript
// analytics.service.ts
async calcReadiness(periodId: string, tx: Prisma.TransactionClient): Promise<void> {
  const period = await tx.periods.findUniqueOrThrow({
    where: { id: periodId },
    include: { object: true },
  });

  const config = await this.configService.getAll(tx);

  const workItems = await tx.periodFacts.findMany({
    where: { periodId },
    include: { boqItem: true },
  });

  // 1. Получаем все lineage_id для батч-запроса
  const lineageIds = workItems.map(f => f.boqItem.workLineageId);

  // 2. БАТЧ: один SQL-запрос вместо N отдельных (устраняет N+1)
  //    getCumulativeFactsBatch возвращает Map<lineageId, cumulativeSum>
  const cumulativeMap = await this.getCumulativeFactsBatch(lineageIds, tx);

  // 3. WMA-темп: один батч по всем позициям
  const historyMap = await this.getWorkPaceHistoryBatch(
    workItems.map(f => f.boqItemId),
    config.avg_pace_periods,
    tx,
  );

  const readinessPerItem: ReadinessItem[] = [];

  for (const fact of workItems) {
    const cumulative = cumulativeMap.get(fact.boqItem.workLineageId) ?? 0;
    const pctReady = Math.min((cumulative / fact.boqItem.planVolume) * 100, 100);

    const history = historyMap.get(fact.boqItemId) ?? [];
    const wma = calcWMA(history, config.decay_factor);

    await tx.workPace.create({
      data: {
        periodId,
        boqItemId: fact.boqItemId,
        periodVolume: fact.acceptedVolume ?? 0,
        weightedPace: wma,
        isExcluded: false,
      },
    });

    readinessPerItem.push({
      pctReady,
      pctReadyRaw: (cumulative / fact.boqItem.planVolume) * 100,  // без capping — для аналитики
      weightCoef: fact.boqItem.weightCoef,
      isCritical: fact.boqItem.isCritical,
      workLineageId: fact.boqItem.workLineageId,
    });
  }

  // 4. Взвешенный % готовности объекта
  const objReadiness = readinessPerItem.reduce(
    (sum, item) => sum + item.pctReady * item.weightCoef,
    0,
  );

  // 5. Два прогноза
  const weightedForecast = calcWeightedForecast(readinessPerItem, config);
  const criticalPathForecast = calcCriticalPathForecast(readinessPerItem, config);
  const gapFlag = differenceInPeriods(criticalPathForecast, weightedForecast) >= config.forecast_gap_alert;

  // 6. Снимок — в той же транзакции
  await tx.readinessSnapshots.create({
    data: {
      periodId,
      objectId: period.objectId,
      objectReadinessPct: objReadiness,
      weightedForecastDate: weightedForecast,
      criticalPathForecastDate: criticalPathForecast,
      gapFlag,
      calculatedAt: new Date(),
      configVersion: config.version,   // фиксируем версию L0-параметров
    },
  });
}

// Батч-запрос WMA-истории — 1 SQL вместо N
private async getWorkPaceHistoryBatch(
  boqItemIds: string[],
  avgPacePeriods: number,
  tx: Prisma.TransactionClient,
): Promise<Map<string, number[]>> {
  const rows = await tx.$queryRaw<{ boq_item_id: string; period_volume: number; rn: number }[]>`
    SELECT boq_item_id, period_volume, rn FROM (
      SELECT boq_item_id, period_volume,
             ROW_NUMBER() OVER (PARTITION BY boq_item_id ORDER BY p.period_number DESC) AS rn
      FROM work_pace wp
      JOIN periods p ON p.id = wp.period_id
      WHERE wp.boq_item_id = ANY(${boqItemIds}::uuid[])
        AND wp.is_excluded = FALSE
    ) ranked
    WHERE rn <= ${avgPacePeriods}
    ORDER BY boq_item_id, rn ASC
  `;

  const result = new Map<string, number[]>();
  for (const row of rows) {
    if (!result.has(row.boq_item_id)) result.set(row.boq_item_id, []);
    result.get(row.boq_item_id)!.push(row.period_volume);
  }
  return result;
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

    // Синхронный пересчёт внутри транзакции — snapshot создан до commit
    // Если calcReadiness упадёт — транзакция откатится, period.status не изменится
    await this.analyticsService.calcReadiness(periodId, tx);
  });

  // REFRESH MV — вне транзакции (ADR-004)
  await this.analyticsService.refreshDashboard(periodId);
}
```

## Admin-корректировка и каскадный пересчёт

При Admin-корректировке `period_facts` закрытого периода (ADR-007) — `readiness_snapshots` для этого и всех последующих периодов устаревают.

```typescript
// analytics.service.ts — вызывается из adminCorrectFact (ADR-007)
async recalcSnapshotCascade(fromPeriodId: string): Promise<void> {
  const fromPeriod = await this.prisma.periods.findUniqueOrThrow({
    where: { id: fromPeriodId },
    select: { objectId: true, periodNumber: true },
  });

  const periodsToRecalc = await this.prisma.periods.findMany({
    where: {
      objectId: fromPeriod.objectId,
      periodNumber: { gte: fromPeriod.periodNumber },
      status: { in: ['closed', 'force_closed'] },
    },
    orderBy: { periodNumber: 'asc' },
  });

  for (const period of periodsToRecalc) {
    await this.prisma.$transaction(async (tx) => {
      await tx.readinessSnapshots.deleteMany({ where: { periodId: period.id } });
      await tx.workPace.deleteMany({ where: { periodId: period.id } });
      await this.calcReadiness(period.id, tx);
    });
  }

  // Один REFRESH MV после всего каскада
  await this.refreshDashboard(fromPeriodId);
}
```

## Версионирование L0-конфигурации в снимках

`config_version` в `readiness_snapshots` фиксирует, при каких параметрах был сделан снимок. Если Admin меняет `decay_factor` — старые снимки посчитаны с другим коэффициентом.

```sql
-- readiness_snapshots.config_version VARCHAR(50) — версия/хэш system_config на момент расчёта
-- При изменении system_config Admin должен принять решение: пересчитать ли историю
```

Дашборд отображает предупреждение, если последний снимок и предыдущий посчитаны при разных `config_version`.

## Инварианты

- `readiness_snapshots` **всегда** создаётся в транзакции `closePeriod` — нет закрытого периода без снимка (DB-level гарантия через атомарность транзакции).
- Дашборд директора читает только из `mv_object_current_status` — не из live-запросов к `period_facts`.
- WMA использует только записи `work_pace.is_excluded = FALSE`.
- `pct_ready` ограничен 100% на уровне позиции (`MIN(..., 100)`); `pct_ready_raw` сохраняется отдельно.
- `SUM(weight_coef) == 1.0` гарантирован триггером `trg_boq_items_weight_coef`.
- `getCumulativeFactsBatch` и `getWorkPaceHistoryBatch` — всегда батч-запросы; `Promise.all` с N отдельными запросами запрещён.
- После Admin-корректировки `recalcSnapshotCascade()` пересчитывает **все** последующие снимки.
- `config_version` записывается в каждый снимок — позволяет обнаружить несравнимые данные.

## Почему синхронный расчёт, а не фоновый job

| Подход | Проблема |
|--------|---------|
| Async job (BullMQ) | Snapshot пуст сразу после закрытия; директор видит дашборд без нового снимка до завершения job |
| **Синхронный в транзакции (принято)** | Snapshot создан до commit — к моменту, когда дашборд обновится, данные уже есть. Откат транзакции = не создан и snapshot, и период не закрыт |

Риск производительности: при 80 позициях батч-запросы выполняются <500мс. При 200 позициях — <2 сек. Допустимо для ClosePeriod (редкая операция).
