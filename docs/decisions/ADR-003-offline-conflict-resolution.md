# ADR-003 — Офлайн-конфликты: два SC на одной позиции

**Статус:** Принято rev 2
**Закрытый риск:** R-03

## Решение
Version counter на офлайн-редактируемых полях + ручная резолюция SC с обязательным примечанием + эскалация Admin при конфликте в закрытом периоде.

## Контекст
SC-A офлайн вводит `sc_volume = 80` для W3/P5. SC-B онлайн меняет на 75. При sync SC-A данные расходятся. `last-write-wins` запрещён архитектурой. `client_timestamp` не используется для детекции — clock skew.

## Практический кейс
SC-A синхронизируется: `last_known_version=1`, сервер `version=2`. Конфликт детектирован → `sync_queue.status='conflict'`. UI показывает device-версию SC-A, актуальное серверное значение (перечитанное, не из кэша), имя последнего инженера и 3 последних записи `audit_log`. SC-A выбирает значение и пишет примечание.

## Контракт реализации

**P-19:** `period_facts.version INTEGER NOT NULL DEFAULT 1`

**P-23:** триггер `trg_period_facts_bump_version` — `fn_period_facts_bump_version()` инкрементирует `version` при изменении **любого** из полей: `sc_volume`, `discrepancy_type`, `note`.

**Детекция:** `sync_queue.last_known_version != period_facts.version` → `status='conflict'`, `conflict_data={server:{...}, device:{...}}`.

**Резолюция `POST /sync/resolve`:** `syncQueueId`, `chosenValue`, `chosenNote`, `note` (обязателен, `@IsNotEmpty`). Серверное значение перечитывается из БД при резолюции, не берётся из `conflict_data`. Только при `period.status='open'`; иначе → `PERIOD_ALREADY_CLOSED_ESCALATE`.

**Эскалация закрытого периода:** создаётся запись `discrepancies` типа `offline_conflict_in_closed_period`; `sync_queue.status='escalated'`; уведомление Admin. Admin разрешает через `adminCorrectFact()` (ADR-007).

**Three-way conflict:** несколько изменений после базовой версии — `version` будет больше `last_known_version` на нужное число; конфликт детектируется корректно. UI показывает актуальное серверное значение.

**Инварианты:**
- `last-write-wins` запрещён; синхронизатор никогда не применяет без проверки `version`
- `note` обязателен — валидация на уровне DTO
- `audit_log` содержит полный snapshot обеих версий и имя SC
- `sync_queue.status='escalated'` — только Admin меняет данные

## Отклонённые альтернативы
| Альтернатива | Причина |
|---|---|
| `last-write-wins` | Запрещён архитектурой; теряет верифицированный факт |
| `client_timestamp` для детекции | Clock skew мобильного устройства — ненадёжен |
| Автоматическое слияние значений | Нет бизнес-правила для выбора правильного объёма |
