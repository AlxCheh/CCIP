# ADR-006 — BoQ Versioning: work_lineage_id и кросс-версионная агрегация

**Статус:** Принято rev 2
**Закрытый риск:** R-06

## Решение
`boq_items.work_lineage_id` (UUID, стабильный) для простого rename + таблица `boq_item_lineage_links(source_item_id, lineage_id, weight)` для split/merge.

## Контекст
При UpdateBaseline позиции получают новые `boq_items.id`. `SUM(period_facts.accepted_volume) WHERE boq_item_id=:id` возвращает факт только по одной версии BoQ — `cumulative_fact` и `pct_ready` ломаются. Split/merge позиций требует n-to-m связей lineage.

## Практический кейс
Объект «Склад»: v1.0 — «бетон фундамент» (plan=500, lineage=L1). UpdateBaseline: split на «бетон Сектор-1» (plan=300, lineage=L1) и «бетон Сектор-2» (plan=200, lineage=L_new). Запись в `boq_item_lineage_links`: `(Сектор-2, L1, 0.40)`. `getCumulativeFact(L1)` суммирует факты по L1 напрямую + 40% фактов Сектора-2.

## Контракт реализации

**P-22:** `boq_item_lineage_links(source_item_id UUID FK, lineage_id UUID, weight DECIMAL(6,5) CHECK(weight>0 AND weight<=1), PRIMARY KEY(source_item_id, lineage_id))`. Индекс `idx_lineage_links_lineage ON (lineage_id)`.

**Уже в schema.sql:** `boq_items.work_lineage_id UUID NOT NULL`, `idx_boq_items_lineage ON boq_items(work_lineage_id)`.

**createNewVersion:** при rename `new_item.workLineageId = predecessor.workLineageId`; при split/merge — `additionalLineageLinks[]` → записи в `boq_item_lineage_links`.

**`getCumulativeFact(lineageId)`:** UNION ALL — прямые факты по `work_lineage_id` + взвешенные факты через `boq_item_lineage_links` (исключая уже учтённые). Запрещён прямой `SUM WHERE boq_item_id=:id`.

**`getCumulativeFactsBatch(lineageIds[])`:** два запроса с `ANY(::uuid[])` + GROUP BY — один вызов вместо N. Обязателен в `calcReadiness` для устранения N+1.

**Инварианты:**
- `work_lineage_id` никогда не меняется после создания позиции
- При rename: `boq_item_lineage_links` не создаётся
- При merge: дополнительные lineage — через `boq_item_lineage_links` с `weight=1.0`
- `SUM(weight)` по участникам одного lineage не обязан равняться 1.0

## Отклонённые альтернативы
| Альтернатива | Причина |
|---|---|
| Name-based matching | Имена редактируются; не стабильный ключ |
| Рекурсивный CTE по `predecessor_item_id` | O(n) по глубине; не поддерживает split/merge |
| Отдельная таблица `work_lineage` | Лишний JOIN; без выигрыша для простого случая |
