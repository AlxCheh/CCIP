# CCIP — Errors Log

> Формат записи: дата · контекст · симптом · причина · решение/статус.
> Добавлять новую запись при обнаружении бага, противоречия «код vs ADR», или hotfix-а.

---

## BUG-001 — P-22: boq_item_lineage_links.source_item_id — type mismatch UUID vs INTEGER

**Дата:** 2026-04-26
**Контекст:** `backend/database/schema.sql`, секция P-22, таблица `boq_item_lineage_links`
**Симптом:** `CREATE TABLE boq_item_lineage_links` завершается с ошибкой PostgreSQL:
`foreign key constraint cannot be implemented: key columns are of incompatible types: uuid and integer`
**Причина:** `source_item_id` объявлен как `UUID`, но `boq_items.id` — `SERIAL` (INTEGER). FK требует совпадения типов.
**Решение:** Изменён тип `source_item_id` с `UUID` на `INTEGER` (исправлено 2026-04-26).
**Статус:** ✅ Закрыт

---

## BUG-002 — P-25: fn_admin_correct_fact — тип параметра UUID вместо INTEGER

**Дата:** 2026-04-26
**Контекст:** `backend/database/schema.sql`, секция P-25, функция `fn_admin_correct_fact`
**Симптом:** Функция создаётся без ошибок, но вызов завершается runtime-ошибкой: `operator does not exist: integer = uuid`
**Причина:** Параметр `p_fact_id` объявлен как `UUID`, но `period_facts.id` — `SERIAL` (INTEGER). PostgreSQL не выполняет implicit cast.
**Решение:** Тип параметра изменён с `UUID` на `INTEGER` (исправлено 2026-04-26).
**Статус:** ✅ Закрыт

---

## BUG-003 — ADR-014: device_tokens.user_id — тип UUID вместо INTEGER

**Дата:** 2026-04-26
**Контекст:** `docs/decisions/ADR-014-push-notifications.md`, контракт реализации P-32
**Симптом:** ADR-014 описывает `user_id UUID FK CASCADE`, но `users.id` — `SERIAL` (INTEGER).
**Причина:** Опечатка в ADR при описании P-32.
**Решение:** В schema.sql (P-32) `device_tokens.user_id` реализован как `INTEGER` (соответствует `users.id`). ADR не меняем (правило: ADR не изменяется); несоответствие зафиксировано здесь.
**Статус:** ✅ Закрыт (обходное решение в коде)

---
