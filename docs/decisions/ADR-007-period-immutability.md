# ADR-007 — Неизменность закрытых периодов и целостность Audit Log

**Статус:** Принято rev 2
**Закрытый риск:** R-07

## Решение
App-level запрет на UPDATE/DELETE `period_facts` для закрытых периодов + Admin-correction только через `fn_admin_correct_fact` (SECURITY DEFINER) + каскадный пересчёт snapshots + append-only `audit_log`.

## Контекст
Закрытый период — верифицированный факт, юридически значимый документ. Прямое изменение данных подрывает бизнес-ценность. При этом технические ошибки ввода случаются и Admin должен иметь возможность корректировать с аудит-следом.

## Практический кейс
Admin исправляет `sc_volume` периода 5 объекта «Склад». Вызывается `adminCorrectFact()` → транзакция через `fn_admin_correct_fact` (SECURITY DEFINER) атомарно обновляет `period_facts` и пишет в `audit_log` с `action='admin_correction'`. Затем `recalcSnapshotCascade(period5)` пересчитывает снимки периодов 5,6,7,...current асинхронно. Дашборд корректен.

## Контракт реализации

**`assertPeriodEditable(periodId, tx)`:** `period.status IN ('closed','force_closed')` → `ForbiddenException('PERIOD_ALREADY_CLOSED')`. Вызывается во всех методах: `submitFact`, `setDiscrepancy`, `resolveConflict`.

**P-25:** `REVOKE UPDATE, DELETE ON period_facts FROM ccip_app`; `REVOKE UPDATE, DELETE ON audit_log FROM ccip_app`. Функция `fn_admin_correct_fact(fact_id, sc_volume, accepted, admin_id, reason)` SECURITY DEFINER — единственный способ UPDATE `period_facts`.

**`adminCorrectFact`:** вызывает `fn_admin_correct_fact` через `$executeRaw` внутри транзакции, затем `recalcSnapshotCascade(periodId)` асинхронно (не блокирует HTTP-ответ).

**`recalcSnapshotCascade(fromPeriodId)`:** находит все закрытые периоды объекта с `periodNumber >= from`. Каждый период — отдельная транзакция: `deleteMany(readinessSnapshots)` → `calcReadiness`. Один REFRESH MV после всего каскада. При 50 периодах × <1 сек = <50 сек.

**`audit_log` append-only:** `AuditLogService` предоставляет только `create()`. `REVOKE UPDATE, DELETE` на уровне БД (P-25).

**Инварианты:**
- `period_facts` изменяет только Admin через `fn_admin_correct_fact` при `status IN ('closed','force_closed')`
- Каждая Admin-корректировка создаёт запись `audit_log` с `action='admin_correction'` — атомарно в SECURITY DEFINER
- После корректировки **все последующие** периоды объекта пересчитываются
- `audit_log`: никогда DELETE, даже Admin — REVOKE на уровне БД

## Отклонённые альтернативы
| Альтернатива | Причина |
|---|---|
| Мягкое удаление (soft delete) | Не решает проблему изменения исторических значений объёмов |
| Versioned facts (новая строка при каждом изменении) | Избыточно; усложняет все аналитические запросы |
