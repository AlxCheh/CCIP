# CCIP — Delivery: Phases 4–7 — Backend: Product Modules

> **Содержание:** ZeroReport (B) · PeriodEngine + DisputeSLA + Analytics (C/D/E) · Вспомогательные модули (F/G/H) · Offline Sync API (I)

**Требует:** Этапы 1–3 завершены → [phase-1-3-foundation-backend.md](phase-1-3-foundation-backend.md)  
**Следующий файл:** [phase-8-13-infra-pilot.md](phase-8-13-infra-pilot.md)  
**Critical path:** [critical-path.md](critical-path.md)

---

## Этап 4 — Backend: 0-отчёт (Блок B)

> **Цель:** SC создаёт стартовый факт; Director утверждает; первый период разблокирован.  
> **Критерий перехода:** `zero_reports.status = 'approved'`; попытка открыть период до утверждения возвращает 403.

- `[H]` 🔴 CRITICAL PATH — `ZeroReportModule`
  - `POST /objects/:id/zero-report` — SC создаёт отчёт (только если нет активного)
  - `POST /objects/:id/zero-report/items` — вносит `fact_volume` по каждой позиции BoQ
  - `POST /objects/:id/zero-report/submit` — SC отправляет на утверждение
  - `POST /objects/:id/zero-report/approve` — `@Roles('director')` → status='approved'
  - Инвариант: только один `approved` 0-отчёт (`uq_zero_reports_approved`)
  - SLA-напоминание: если не утверждён за `zero_report_alert_days` (L0) → уведомление директору
  - Артефакт: `apps/api/src/zero-report/zero-report.module.ts`
  - Критерий: открытие периода без approved 0-отчёта → 403 `ZERO_REPORT_NOT_APPROVED`

---

## Этап 5 — Backend: Цикл периода (Блок C) + SLA-планировщик (Блок D)

> **Цель:** полный happy path цикла + обработка расхождений с SLA-таймерами.  
> **Критерий перехода:** сценарий A deadlock отрабатывает автоматически через BullMQ; период закрывается.

### 5.1 PeriodEngine (Блок C)

- `[H]` 🔴 CRITICAL PATH — `PeriodsModule`
  - `POST /objects/:id/periods/open` — открыть период
    - `pg_advisory_xact_lock(md5-hash of object_id)` в транзакции (⚠️ ADR-002)
    - `SET LOCAL lock_timeout = '5s'`
    - Генерировать `gp_submission_token` (UUID) + `gp_token_expires_at = sla_force_close_at - 1h`
    - Только если `zero_reports.status = 'approved'`
    - Только если нет открытого периода (блокировка через UNIQUE)
    - Отправить шаблон-письмо ГП с токеном
  - `GET /objects/:id/periods` — список периодов
  - `GET /objects/:id/periods/:period_id` — детали периода
  - Артефакт: `apps/api/src/periods/periods.module.ts`

- `[H]` 🔴 CRITICAL PATH — Подача ГП через `GpTokenGuard`
  - `POST /gp/submit/:token` — ГП заполняет `gp_volume` по позициям (только открытые поля из XLS)
  - Одноразовость: `gp_submitted_at IS NOT NULL` → 403 `GP_ALREADY_SUBMITTED`
  - Истечение: `gp_token_expires_at < NOW()` → 403 `GP_TOKEN_EXPIRED`
  - Артефакт: `apps/api/src/gp/gp.module.ts`

- `[H]` 🔴 CRITICAL PATH — Верификация SC
  - `PATCH /periods/:id/facts/:boq_item_id` — SC вводит `sc_volume`
  - Автоматическое определение типа расхождения: delta=0 → Confirmed; delta≠0 + accessible=TRUE → Type 1
  - Триггер `trg_period_facts_bump_version` инкрементирует `version` (⚠️ ADR-003)
  - Артефакт: методы в `PeriodFactsService`

- `[H]` 🔴 CRITICAL PATH — `POST /periods/:id/close`
  - Блокировка при `COUNT(discrepancies WHERE status='open') > 0`
  - Транзакция: close → `CalcReadiness` → INSERT `readiness_snapshots` → INSERT `work_pace`
  - `readiness_snapshots` создаётся **внутри транзакции** (нет закрытого периода без снимка, ⚠️ ADR-011)
  - После транзакции: поставить BullMQ job на `REFRESH MATERIALIZED VIEW CONCURRENTLY`
  - Артефакт: `ClosePeriodService` + `AnalyticsService.calcReadiness()`

### 5.2 DisputeSLA Engine (Блок D, ⚠️ ADR-005)

- `[H]` 🔴 CRITICAL PATH — `DisputesModule`
  - `POST /periods/:id/facts/:boq_item_id/dispute` — SC выставляет Тип 2 (требует reason + photo)
  - `GET /periods/:id/discrepancies` — журнал (не передаётся ГП)
  - Тип 3: `DisputeFlagService` — проверяет `N_flag_threshold` за `M_flag_window` → флаг на дашборде

- `[H]` 🔴 CRITICAL PATH — `SlaSchedulerModule` — BullMQ Worker (⚠️ ADR-005)
  - **ROLE=worker** env: worker регистрирует процессоры; api-процесс не регистрирует
  - При Тип 2 выставлен: INSERT `sla_events` (Сценарий A: day+3, day+5)
  - BullMQ.add(`jobId='sla-{event.id}'`, delay=Δt, attempts=3)
  - `onModuleInit()` recovery scan — `WHERE executed_at IS NULL` → пересоздать jobs, просроченные delay=0
  - Idempotency guard: `if (event.executedAt) return`
  - Day 3: уведомление директору; Day 5: `force_close` → status='forced_sc_figure'
  - DELETE guard триггер на `sla_events` (⚠️ ADR-005, P-24) — нельзя удалить выполненное событие
  - Артефакт: `apps/api/src/sla-scheduler/sla-scheduler.module.ts`
  - Критерий: убить Redis, рестартовать worker → все pending SLA события восстановлены

### 5.3 AnalyticsEngine (Блок E, ⚠️ ADR-011)

- `[H]` 🔴 CRITICAL PATH — `AnalyticsService`
  - `calcReadiness(periodId)`: `pct_ready = MIN(fact/plan×100, 100)` per work; `obj_readiness = Σ(pct_ready × weight_coef)`
  - `calcWmaPace(boqItemId)`: WMA с `decay_factor`, исключение `work_pace.is_excluded`; `getCumulativeFactsBatch()` через `work_lineage_id` + `boq_item_lineage_links` (⚠️ ADR-006)
  - `calcForecasts()`: `weighted_forecast_date` + `critical_path_forecast_date` (MAX по `weight_coef ≥ weight_threshold` ∪ `is_critical`)
  - `recalcSnapshotCascade(periodId)` — для Admin-корректировки: пересчитать все последующие снимки (⚠️ ADR-007)
  - **Live-расчёт на дашборде запрещён** — только из `readiness_snapshots`
  - Артефакт: `apps/api/src/analytics/analytics.service.ts`

- `[H]` MV Refresh Worker (⚠️ ADR-004)
  - BullMQ job: `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_object_current_status`
  - При exhausted retries (3 попытки): `mv_refresh_log.is_stale = TRUE` немедленно
  - Self-healing cron: каждые 5 минут проверяет `is_stale = TRUE` → re-queue refresh
  - Fixed manual jobId для дедупликации
  - Артефакт: `apps/api/src/analytics/mv-refresh.worker.ts`
  - Критерий: имитировать исчерпание retry → `is_stale = TRUE` → cron восстанавливает

---

## Этап 6 — Backend: Вспомогательные модули

> **Цель:** UpdateBaseline, смена ГП, Admin-корректировка — функции, нужные к пилоту, но не на critical path MVP.

### 6.1 UpdateBaseline (Блок F/G)

- `[M]` `BaselineUpdateModule`
  - `POST /objects/:id/baseline-update-requests` — SC инициирует (boq_item_id, new_plan_volume, reason, doc)
  - `POST /baseline-update-requests/:id/approve` — `@Roles('admin')`, только если `period.status != 'open'`
  - При approve: UPDATE `plan_volume` → RECALC `weight_coef` → CREATE new `boq_version`
  - Новая версия: `work_lineage_id` наследуется от predecessor (⚠️ ADR-006)
  - Артефакт: `apps/api/src/baseline-update/baseline-update.module.ts`

### 6.2 Смена ГП (Блок H)

- `[M]` Метод `changeGeneralContractor()` в `ObjectsModule`
  - Только при `period.status != 'open'` И `COUNT(discrepancies WHERE status='open') == 0`
  - SCD Type 2: старый `is_current=false, valid_to=NOW()`; новый `is_current=true`
  - Уведомление нового ГП об открытых спорах — явная процедура (§10.3 пробел)
  - Артефакт: метод в `ObjectParticipantsService`

### 6.3 Admin-корректировка закрытых периодов (⚠️ ADR-007)

- `[M]` `POST /admin/periods/:id/correct-fact`
  - Только `@Roles('admin')`
  - Транзакция: вызов `fn_admin_correct_fact()` (SECURITY DEFINER) → INSERT в `audit_log` с reason
  - После транзакции: async `recalcSnapshotCascade(periodId)` для всех последующих снимков
  - Артефакт: `apps/api/src/admin/admin-correction.service.ts`
  - Критерий: `period_facts` обновляется только через эту функцию; прямой UPDATE через `ccip_app` → ошибка прав

### 6.4 Уведомления

- `[M]` `NotificationsModule`
  - `NotificationService.notify(userId, type, referenceTable, referenceId, message)`
  - INSERT в `notifications`; async отправка через SMTP
  - `GET /notifications` — для текущего пользователя; `PATCH /notifications/:id/read`
  - Артефакт: `apps/api/src/notifications/notifications.module.ts`

---

## Этап 7 — Backend: Offline Sync API (Блок I)

> **Цель:** Mobile App может работать офлайн и синхронизироваться без потери данных.  
> **Критерий перехода:** конфликт обнаруживается по `version`, не по timestamp; `last-write-wins` невозможен.

- `[H]` `SyncModule` (⚠️ ADR-003, ADR-008)
  - `POST /sync/operations` — принять batch офлайн-операций из `sync_queue`
    - Для каждой операции: проверить `boqVersionNumber` (⚠️ ADR-006 version gating); проверить конфликт по `version`
    - Статус: `pending → applied | conflict | rejected | escalated`
    - При конфликте: `sync_queue.status='conflict'`, вернуть `conflict_data = { server: {...}, device: {...} }`
    - Конфликт в закрытом периоде → `escalated`, Admin через `discrepancies`
  - `POST /sync/resolve` — SC выбирает версию вручную (обязателен `note`)
    - `resolveConflict()` перечитывает актуальное серверное значение из БД (не из `conflict_data.server`)
  - `POST /sync/photos` — multipart, по одному файлу, resumable
  - Архивация: cron job — DELETE `sync_queue WHERE status IN ('applied','rejected','escalated') AND created_at < NOW()-30d`
  - Артефакт: `apps/api/src/sync/sync.module.ts`
  - Критерий: `last-write-wins` невозможен конструктивно; конфликт при одинаковом version возвращает 200 с `conflict_data`
