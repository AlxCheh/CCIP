# ADR-008 — WatermelonDB и граница offline/online операций

**Статус:** Принято rev 2
**Закрытый риск:** R-08

## Решение
WatermelonDB (SQLite) как локальное хранилище + явный список offline/online операций + двухканальный sync: `/sync/operations` (JSON) + `/sync/photos` (multipart per file) + BoQ version gating.

## Контекст
SC работает без стабильной сети. Нужны реактивные запросы и сериализованная очередь офлайн-действий. Одиночный `POST /sync` с 60+ МБ фото неприемлем на 3G. Нечёткая граница offline/online → SC пытается закрыть период офлайн → race condition на сервере.

## Практический кейс
SC-A офлайн: 12 записей `submit_fact`, 3 фото, 1 `add_discrepancy_note` — всё в `sync_queue` с `status='pending'`. При восстановлении сети SyncManager: сначала `/sync/operations` (все операции кроме фото), затем по одному `/sync/photos/:id`. Одно фото не блокирует остальные при ошибке.

## Контракт реализации

**Доступно офлайн (sync_queue):** `submit_fact`, `upload_photo`, `add_discrepancy_note`, `open_period`.

**Только онлайн (disabled в UI без сети):** `close_period`, `submit_gp_template`, `approve_zero_report`.

**SyncManager:**
- `syncOperations()`: `POST /sync/operations` — batch всех non-photo pending. Каждый entry несёт `boqVersionNumber` и `lastKnownVersion`.
- `syncPhotos()`: loop `POST /sync/photos` — по одному, ошибка одного не останавливает цикл.

**BoQ Version Gating:** каждая запись sync_queue хранит `boqVersionNumber`. Сервер при `submit_fact` / `add_discrepancy_note` сверяет с активной версией → при расхождении: `status='rejected'`, `rejectedReason='BOQ_VERSION_MISMATCH'`.

**open_period офлайн:** идемпотентен — pending-запись для того же `object_id` обновляется (не дублируется). Сервер применяет advisory lock (ADR-002).

**Reconciliation при рестарте приложения:** `is_syncing=true` записи сбрасываются в `false` при `SyncManager.init()`, затем пересылаются.

**Bulk resolve:** `POST /sync/resolve-bulk` — `strategy: 'all_device' | 'all_server' | 'individual'` + обязательное `globalNote`.

**Инварианты:**
- Все офлайн-операции только через `sync_queue`, никогда напрямую в API
- `conflict_data.server` перечитывается при открытии карточки, не из кэша
- `boqVersionNumber` передаётся с каждой операцией

## Отклонённые альтернативы
| Альтернатива | Причина |
|---|---|
| AsyncStorage | Key-value only; нет реляционных запросов; нет реактивности |
| expo-sqlite (прямой) | Нет реактивности; sync-логику писать с нуля |
| Realm | Проприетарные ограничения; другая модель запросов |
