# CCIP — Delivery: Mobile App

> **Статус:** Отложен. Реализуется после завершения пилота (Этапы 8, 10–13).  
> **Требует:** Этапы 1–13 завершены → Web App + Sync API работают в production.  
> **Critical path:** [critical-path.md](critical-path.md)

---

## Этап 9 — Mobile App

> **Цель:** SC может работать офлайн на объекте; данные синхронизируются при появлении сети.  
> **Критерий перехода:** `submit_fact` офлайн → потеря сети → восстановление сети → sync → данные в БД.

### 9.1 Фундамент

- `[H]` Инициализировать `apps/mobile` (React Native + Expo или bare workflow)
  - WatermelonDB: локальная схема, зеркалящая ключевые сущности (periods, period_facts, boq_items, sync_queue)
  - Артефакт: `apps/mobile/src/database/schema.ts`

- `[H]` Auth: login (JWT → AsyncStorage для access; refresh через HTTP-only cookie)

### 9.2 Sync Manager (⚠️ ADR-008)

- `[H]` `SyncManager` — ядро offline-first логики
  - Определение online/offline: NetInfo
  - При online → `POST /sync/operations` + `POST /sync/photos`
  - Идемпотентность `open_period`: дубль в очереди заменяется (upsert по operation+period_id)
  - **Только онлайн (UI блокирует офлайн):** `close_period`, `submit_gp_template`, `approve_zero_report`
  - `is_syncing` флаг для reconciliation при рестарте приложения
  - Артефакт: `apps/mobile/src/sync/SyncManager.ts`

### 9.3 Критические экраны Mobile

- `[H]` 🔴 CRITICAL PATH — Список объектов и активный период
- `[H]` 🔴 CRITICAL PATH — Карточка вида работ (аналог web, но mobile-first)
  - Ввод `sc_volume`, фото из камеры с геотегом + timestamp
  - Флаг Тип 2 с обязательным фото

- `[H]` 🔴 CRITICAL PATH — Экран разрешения конфликта
  - Отображает обе версии (device vs server) с именами инженеров и датами
  - SC выбирает версию с обязательным `note`

- `[M]` Push-уведомления (FCM/APNs): SLA-события, уведомления о расхождениях

---

## Зависимости

Серверная сторона (Sync API — `apps/api/src/modules/sync`) реализована в Этапе 7.  
Mobile-клиент реализует только интеграцию с готовым API.

Связанные манифесты:

- `apps/api/src/modules/sync/sync.manifest.md`

Связанные ADR:

- `ADR-003-offline-conflict-resolution.md`
- `ADR-008-watermelondb-offline.md`
- `ADR-014-push-notifications.md`
