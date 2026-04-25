# ADR-011 — Стратегия предвычисления аналитики

**Статус:** Принято rev 2
**Закрытый риск:** R-11

## Решение
`calcReadiness` выполняется синхронно **в транзакции** `closePeriod` — snapshot создан до commit. Дашборд читает из `mv_object_current_status`.

## Контекст
Live-расчёт на каждый GET: 80 позиций × 50 периодов × JOIN по lineage = O(4000) строк per объект. При 20+ объектах на дашборде — неприемлемо. Async job создаёт окно пустого snapshot сразу после закрытия периода.

## Практический кейс
`closePeriod(period7)`: статус → `'closed'`, затем в той же транзакции `calcReadiness(period7, tx)` — пишет `work_pace` и `readiness_snapshots`. Если `calcReadiness` упадёт — транзакция откатится, период не закроется. После commit: `REFRESH MV CONCURRENTLY` (ADR-004). Директор открывает дашборд — видит актуальный снимок.

## Контракт реализации

**`calcReadiness(periodId, tx)`:** внутри транзакции вызывает:
1. `getCumulativeFactsBatch(lineageIds[], tx)` — один SQL с `ANY(::uuid[])` + GROUP BY (не N отдельных запросов)
2. `getWorkPaceHistoryBatch(boqItemIds[], avgPacePeriods, tx)` — ROW_NUMBER OVER (PARTITION BY boq_item_id ORDER BY period_number DESC), `WHERE rn <= avgPacePeriods`
3. WMA через `calcWMA(history[], decay_factor)` per item
4. `INSERT work_pace` per item
5. `INSERT readiness_snapshots` — `obj_readiness`, `weighted_forecast_date`, `critical_path_forecast_date`, `gap_flag`, `config_version`

**`pct_ready`:** `MIN(cumulative/planVolume*100, 100)`. `pct_ready_raw` (без capping) сохраняется отдельно.

**`SUM(weight_coef) == 1.0`** гарантирован триггером `trg_boq_items_weight_coef`.

**`config_version`** записывается в каждый снимок. Дашборд предупреждает если последний и предыдущий снимки имеют разные `config_version`.

**`recalcSnapshotCascade(fromPeriodId)`:** при Admin-корректировке (ADR-007). Периоды `periodNumber >= from`, `status IN ('closed','force_closed')`, каждый в отдельной транзакции: `deleteMany(readinessSnapshots)` + `deleteMany(workPace)` + `calcReadiness`. Один REFRESH MV после всего каскада.

**WMA:** `work_pace.is_excluded=FALSE` — исключённые записи не участвуют в расчёте.

**Инварианты:**
- `readiness_snapshots` создаётся в транзакции `closePeriod` — нет закрытого периода без снимка
- `getCumulativeFactsBatch` и `getWorkPaceHistoryBatch` — всегда батч; `Promise.all(N запросов)` запрещён
- Дашборд читает только из `mv_object_current_status`, не из live `period_facts`

## Отклонённые альтернативы
| Альтернатива | Причина |
|---|---|
| Async job (BullMQ) | Snapshot пуст до завершения job; директор видит пустой дашборд |
| Live-расчёт на GET | O(4000+ строк) при 20+ объектах; неприемлемая нагрузка |
