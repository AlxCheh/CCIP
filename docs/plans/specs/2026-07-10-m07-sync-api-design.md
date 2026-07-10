# M-07: Offline Sync API (Блок I) — Design

> Спека дизайна перед implementation-планом. Источники: `docs/delivery/phase-4-7-backend-modules.md` Этап 7, ADR-003 (version-based конфликты), ADR-006 (version gating BoQ), ADR-008 (WatermelonDB offline), `docs/architecture/sync-engine.md`.

## 1. Цель и скоуп

Серверный Sync API принимает офлайн-операции мобильного клиента и разрешает конфликты. Мобильный клиент реализуется позже (M-M, пост-пилот) — M-07 закрывает только серверную часть.

**Скоуп (весь Этап 7):**
- `POST /sync/operations` — batch-приём офлайн-операций;
- `POST /sync/resolve` — ручная резолюция конфликта (SC, обязательный `note`);
- `POST /sync/photos` — приём фото (multipart, один файл, безопасный ретрай);
- архивация очереди — repeatable-джоб, 30 дней.

**Решения по скоупу (зафиксированы с пользователем 2026-07-10):**
- Типы операций в M-07 — **только факты** (`upsert_period_fact`). `open_period` через sync — отложено до M-M, когда появится реальный клиент (gpToken-семантику без клиента не проверить).
- Эскалация закрытого периода — **без уведомления Admin** (Notification Service = ADR-014, не реализован). Admin видит эскалацию в журнале расхождений. Задокументированный пробел.
- Идемпотентность — **миграция**: `sync_queue.client_op_id` + `UNIQUE(device_id, client_op_id)`. Клиент генерирует UUID на операцию. Естественный ключ по `client_timestamp` отвергнут — clock skew (тот же аргумент, что в ADR-003 против timestamp-детекции).

**Вне скоупа:** мобильный клиент (WatermelonDB, локальная очередь), уведомления (ADR-014), `open_period`/чеклист-операции, tus/чанкованная загрузка, интеграционные тесты sync-блока (follow-up, если нет готового плейсхолдера).

## 2. Подход к применению операций (принят: A)

`PeriodService.upsertPeriodFact` расширяется опциональным `opts.expectedVersion`:
- внутри существующей транзакции, после чтения текущего факта: если `expectedVersion` задан и `!== period_facts.version` — бросается `VersionConflictException` с серверным снапшотом (`scVolume`, `version`, кто и когда менял);
- онлайн-вызовы (без параметра) не меняются;
- CAS атомарен — TOCTOU-окна нет, last-write-wins невозможен конструктивно (критерий Этапа 7).

Отклонены: самодостаточный SyncService (дублирует ядро домен-правил периода — ADR-007 editable, C2 ввод после дедлайна ГП, C3 фото для Тип-2, delta для аналитики; риск дрейфа) и check-then-delegate без атомарности (TOCTOU = скрытый last-write-wins, нарушает ADR-003).

## 3. Состав модуля

```
apps/api/src/modules/sync/
  sync.module.ts        — imports: Prisma, Auth, AuditLog, PeriodModule, BullModule(queue), storage
  sync.controller.ts    — 3 эндпоинта, @Roles('stroycontrol', 'admin')
  sync.service.ts       — очередь, статусы, конфликты, эскалация, резолюция
  sync-archival.worker.ts — repeatable BullMQ-джоб (ночной cron), 30d cleanup
  dto/                  — sync-operations.dto, sync-resolve.dto, sync-photo.dto
```

Миграция: `ALTER TABLE sync_queue ADD client_op_id VARCHAR(64)` + `UNIQUE(device_id, client_op_id)` (partial/nullable — старых строк нет, поле обязательно на уровне DTO).

## 4. Поток `POST /sync/operations`

Batch обрабатывается FIFO, последовательно. Для каждого элемента:

1. **Дедуп:** запись с `(deviceId, clientOpId)` уже есть → операция не применяется повторно, в ответ идёт сохранённый результат (статус, `conflictData` если был). Идемпотентность per sync-engine §8.
2. **Приём:** создаётся строка `sync_queue` (`pending`, `server_received_at = NOW()`).
3. **Гейт ADR-006:** `boqVersionNumber` операции сравнивается с активной `boq_versions.version_number` объекта → mismatch = `rejected` (`BOQ_VERSION_MISMATCH`).
4. **Применение:** `upsertPeriodFact(..., { expectedVersion: lastKnownVersion })` →
   - успех → `applied`;
   - `VersionConflictException` → `conflict`, `conflict_data = { server: {…свежий снапшот из исключения…}, device: {…payload…} }`;
   - домен-отказ (`PERIOD_WRONG_STATUS`, `TYPE2_PHOTO_REQUIRED`, …) → `rejected` + `reason` (коды PeriodService переиспользуются as-is);
   - конфликт при `period.status IN ('closed','force_closed')` → `escalated` + запись `discrepancies` типа `offline_conflict_in_closed_period`.
5. **Остановка батча (sync-engine §9):** по первому `conflict`/`escalated` остаток батча не заводится в очередь; в ответе элементы помечаются `skipped` — клиент перешлёт их после резолюции.

Ответ — всегда `200` с массивом `{ clientOpId, status, syncQueueId?, reason?, conflictData? }` по каждому элементу. Инвалидный элемент (нет `clientOpId`, неизвестный `operation`) → `rejected` на уровне элемента, не 400 на весь батч.

## 5. Поток `POST /sync/resolve`

DTO: `{ syncQueueId, chosenValue, note }`, `note` — `@IsNotEmpty` (инвариант ADR-003).

1. Запись должна быть в статусе `conflict`, резолюция — SC той же организации.
2. Серверное значение **перечитывается из БД**, не берётся из `conflict_data` (ADR-003).
3. Период открыт → `chosenValue` применяется через `upsertPeriodFact` (без `expectedVersion` — резолюция есть осознанная перезапись), `sync_queue`: `status='applied'`, `resolved_at`, `resolved_by`.
4. Период закрыт → `status='escalated'` + discrepancy `offline_conflict_in_closed_period`, ответ `PERIOD_ALREADY_CLOSED_ESCALATE` (Admin далее через `adminCorrectFact()`, ADR-007).
5. `audit_log`: полный снапшот обеих версий + note + имя SC.

## 6. Поток `POST /sync/photos`

Multipart, один файл (`FileInterceptor`, паттерн documents). Поля: `clientOpId`, `periodId`, `boqItemId?`, `takenAt?`.

- «Resumable» = безопасный ретрай: повтор `(deviceId, clientOpId)` возвращает уже созданный `photo.id`, файл не дублируется. Без tus/чанков — мобильные фото весят мегабайты.
- Файл → S3/MinIO через существующий `StorageService`; создаётся строка `Photo`.
- Проверки: тенантность (`period → object.organizationId`), период редактируем (те же статусы, что для ввода факта).

## 7. Архивация

Repeatable BullMQ-джоб (cron, ночной, раз в сутки), паттерн `MvRefreshWorker`:
`DELETE FROM sync_queue WHERE status IN ('applied','rejected','escalated') AND created_at < NOW() - INTERVAL '30 days'`.
`conflict` не удаляется — нерешённый конфликт не должен исчезнуть.

## 8. Audit и ошибки

- `audit_log`: конфликт (снапшот обеих версий), резолюция (выбор + note + SC), эскалация.
- Все `rejected` несут машинный `reason`-код.
- Статусная модель `sync_queue`: `pending → applied | conflict | rejected | escalated`; `conflict → applied` (resolve) или `conflict → escalated` (закрытый период при resolve).

## 9. Тестирование

Юнит-тесты по паттерну M-06 (mocked Prisma, `$transaction → fn(prisma)`):
- критерий Этапа 7: конфликт version возвращает `200` + `conflict_data`; при `expectedVersion`-mismatch данные не изменяются никогда;
- дедуп повторного `clientOpId` (не применяется дважды, возвращается прежний результат);
- остановка батча по первому конфликту, остаток `skipped`;
- гейт `BOQ_VERSION_MISMATCH`;
- эскалация закрытого периода (+discrepancy);
- resolve: перечитывание из БД, обязательный note, `PERIOD_ALREADY_CLOSED_ESCALATE`;
- фото: идемпотентность повторной загрузки;
- `period.service.spec.ts`: новые кейсы `expectedVersion` (совпадает/не совпадает/не задан).

## 10. Закрытие модуля

По завершении: `docs/project-state.md` (M-07 → done), `docs/delivery/phase-4-7-backend-modules.md` (реальный путь артефакта вместо planned), `ADR-003` impl_anchors уже указывает на `apps/api/src/modules/sync/`.
