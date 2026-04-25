# CCIP — Technical Delivery Plan v1.0

> ⚠️ **Этот файл разбит на фазовые документы.** Используйте `docs/delivery/` вместо этого файла:
> - [critical-path.md](delivery/critical-path.md) — критический путь, MVP-чеклист, DAG
> - [phase-0-architecture-gaps.md](delivery/phase-0-architecture-gaps.md) — ADR-012, пробелы
> - [phase-1-3-foundation-backend.md](delivery/phase-1-3-foundation-backend.md) — репо, Auth, Init A
> - [phase-4-7-backend-modules.md](delivery/phase-4-7-backend-modules.md) — ZeroReport, PeriodEngine, DisputeSLA, Analytics, Sync
> - [phase-8-13-infra-pilot.md](delivery/phase-8-13-infra-pilot.md) — Web, Mobile, Security, Testing, Infra, Pilot

**Дата:** 2026-04-25  
**Основание:** architecture_v1_0.md · ADR-001..011 · schema.sql (P-01..P-25)  
**Статус входных артефактов:** схема БД готова, все ADR приняты, код не начат

---

## Условные обозначения

| Маркер | Значение |
|--------|---------|
| `[H]` | High — блокирует следующий этап или является частью критического пути |
| `[M]` | Medium — необходимо для MVP, но не блокирует параллельные треки |
| `[L]` | Low — важно до production, но не для первого пилота |
| `🔴 CRITICAL PATH` | Задача на критическом пути к запуску MVP |
| `⚠️ ADR-NNN` | Задача напрямую диктуется конкретным ADR |

---

## Критический путь MVP (сводка)

```
ADR-012 (multi-tenancy) → Репозитории + окружения
  └─► Auth/RBAC (JWT + GpTokenGuard)
        └─► Init-модуль A (L0–L2, BoQ, weight_coef trigger)
              └─► ZeroReport-модуль B (стартовый факт, таймер)
                    └─► PeriodEngine-модуль C (open → GP → verify → close)
                          └─► DisputeSLA-модуль D (Type 1/2/3, deadlock A/B, BullMQ)
                                └─► Analytics-модуль E (snapshots, WMA, 2 прогноза, MV)
                                      └─► Web App (dashboard + period cycle)
                                            └─► Пилотный объект
```

Параллельно критическому пути (не блокируют MVP, но нужны к пилоту):
- Mobile App — блок I (offline sync)
- Уведомления (email + notifications table)
- UpdateBaseline — блок F/G
- Инфраструктура (K8s, S3, PgBouncer)

---

## Этап 0 — Архитектурное завершение (до первой строки кода)

> **Цель:** закрыть единственный открытый архитектурный пробел, который блокирует backend.  
> **Критерий перехода:** ADR-012 принят и зафиксирован.

### 0.1 Multi-tenancy решение

- `[H]` 🔴 CRITICAL PATH — Принять ADR-012: RLS vs `organization_id` в WHERE
  - Опция A: Row-Level Security (Prisma `$extends` + `SET LOCAL ccip.current_org`)
  - Опция B: `organization_id` в каждой таблице + Prisma middleware фильтр
  - **Решение необходимо до** создания Prisma-схемы и любого сервиса
  - Артефакт: `docs/decisions/ADR-012-multitenancy.md`
  - Критерий приёмки: ADR подписан, Prisma-middleware или RLS-политики описаны на псевдокоде

- `[M]` Определить стратегию `system_config` per-object overrides
  - §10.4 arch: нужен `object_config` при >1 ОКС на аккаунте
  - Артефакт: примечание в ADR-012 или отдельный ADR-013
  - Если откладывается — явно записать как технический долг

### 0.2 Открытые пробелы, не блокирующие MVP

- `[M]` PDF-генерация: выбрать движок (Puppeteer vs WeasyPrint) и определить шаблоны
  - Артефакт: решение зафиксировано в `docs/decisions/ADR-013-pdf-reports.md` (может быть принято позже)
- `[M]` Push-уведомления mobile: выбрать провайдер (FCM/APNs)
  - `notifications` таблица есть; нужен только интеграционный слой
- `[L]` ML-pipeline: зарезервировано в схеме (`ml_features`, `forecast_scenarios`), не в MVP

---

## Этап 1 — Подготовка репозиториев и окружений

> **Цель:** у каждого разработчика работает `docker compose up` за < 5 минут.  
> **Критерий перехода:** все сервисы отвечают на health-check, CI прогоняет пустые тесты.

### 1.1 Репозитории и монорепо

- `[H]` 🔴 CRITICAL PATH — Инициализировать монорепо структуру
  ```
  ccip/
    apps/
      api/           # NestJS backend
      web/           # React frontend  
      mobile/        # React Native
    packages/
      database/      # Prisma schema + migrations
      shared/        # Общие типы TS (DTOs, enums)
    infra/
      docker/        # docker-compose.yml, Dockerfiles
      k8s/           # Kubernetes manifests
    docs/            # architecture, ADR, delivery plan
  ```
  - Артефакт: репозиторий с `.gitignore`, `turbo.json` / `nx.json`, `pnpm-workspace.yaml`

- `[H]` Создать `packages/database` — Prisma schema из `schema.sql`
  - Перевести все P-01..P-25 в `schema.prisma`
  - Создать начальную миграцию `0001_initial`
  - ⚠️ ADR-001: `pool_mode=session` — настроить в `DATABASE_URL` с `pgbouncer=true` если PgBouncer
  - Артефакт: `packages/database/schema.prisma` + `migrations/0001_initial.sql`
  - Критерий: `prisma migrate deploy` на чистой БД проходит без ошибок

- `[H]` Создать `packages/shared` — типы и enums
  - `UserRole`, `PeriodStatus`, `DiscrepancyType`, `SyncStatus`, `SlaScenario`
  - Артефакт: `packages/shared/src/types.ts` с полным набором enum-ов

### 1.2 Docker Compose (dev окружение)

- `[H]` 🔴 CRITICAL PATH — `docker-compose.yml` с полным стеком
  ```yaml
  services:
    postgres:    # PostgreSQL 16, порт 5432, init-script из schema.sql
    redis:       # Redis 7, AOF persistence обязательна (⚠️ ADR-005)
    minio:       # MinIO для S3-совместимого хранилища
    pgbouncer:   # PgBouncer pool_mode=session (⚠️ ADR-001, ADR-002)
    mailhog:     # Перехват SMTP в dev
  ```
  - Артефакт: `infra/docker/docker-compose.yml`
  - Критерий: `docker compose up -d` + `prisma migrate deploy` + `prisma db seed` выполняются без ошибок

- `[H]` Seed-скрипт для dev-данных
  - 1 организация, 3 пользователя (admin, director, stroycontrol), 1 объект, 1 BoQ v1.0 с 5 позициями
  - `SUM(weight_coef) == 1.0` обязательно
  - Артефакт: `packages/database/seed.ts`

### 1.3 CI/CD базовая конфигурация

- `[H]` CI pipeline (GitHub Actions / GitLab CI)
  - Шаги: `pnpm install` → `tsc --noEmit` (typecheck) → `prisma validate` → `jest --ci`
  - Артефакт: `.github/workflows/ci.yml`
  - Критерий: pipeline проходит на пустых тестах

- `[M]` Pre-commit hooks
  - ESLint + Prettier + `prisma format`
  - Артефакт: `.husky/` конфигурация

### 1.4 Переменные окружения

- `[H]` Файлы `.env.example` для каждого приложения
  ```
  DATABASE_URL=         # с pgbouncer=true параметром
  REDIS_URL=
  JWT_ACCESS_SECRET=
  JWT_REFRESH_SECRET=
  S3_ENDPOINT=
  S3_BUCKET=
  SMTP_HOST=
  WORKER_ROLE=          # 'api' | 'worker' — для BullMQ ROLE separation (⚠️ ADR-005)
  ```
  - Критерий: нет хардкода секретов в коде; все настраивается через env

---

## Этап 2 — Backend: Auth и фундамент

> **Цель:** работающий JWT/RBAC слой, без которого нельзя защитить ни один endpoint.  
> **Критерий перехода:** Postman/curl возвращает 401 на все защищённые маршруты; роли корректно разграничены.

### 2.1 NestJS Bootstrap

- `[H]` 🔴 CRITICAL PATH — Инициализировать `apps/api` (NestJS)
  - Global pipes: `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`
  - Global filters: `HttpExceptionFilter`
  - Global interceptors: `TransformInterceptor` (обёртка ответа)
  - Helmet, CORS настройка
  - Артефакт: `apps/api/src/main.ts` + `AppModule`

- `[H]` PrismaModule — глобальный, инжектируется в все сервисы
  - `onModuleInit()`: `$connect()`; `onModuleDestroy()`: `$disconnect()`
  - Артефакт: `apps/api/src/prisma/prisma.module.ts`

- `[H]` AuditLogService — реализовать **первым** среди сервисов
  - Метод: `record({ tableName, recordId, action, oldData, newData, reason, performedBy })`
  - **Только INSERT** — нет методов update/delete (⚠️ ADR-007, ADR-010)
  - Артефакт: `apps/api/src/audit-log/audit-log.service.ts`
  - Критерий: `REVOKE UPDATE,DELETE` для `ccip_app` проверен интеграционным тестом

### 2.2 Аутентификация (⚠️ ADR-009)

- `[H]` 🔴 CRITICAL PATH — AuthModule: регистрация, login, refresh, logout
  - `POST /auth/login` → Access Token (15 min, Bearer) + Refresh Token (30d, HTTP-only cookie)
  - `POST /auth/refresh` → ротация Refresh Token; хэш SHA-256 в `refresh_tokens`
  - `POST /auth/logout` → `revoked_at = NOW()`
  - Артефакт: `apps/api/src/auth/auth.module.ts` + `JwtStrategy` + `RefreshStrategy`
  - Критерий: refresh token ротируется; повторное использование старого возвращает 401

- `[H]` 🔴 CRITICAL PATH — `JwtAuthGuard` + `RolesGuard` — глобальная регистрация
  - Декоратор `@Roles('admin', 'director', 'stroycontrol')`
  - Декоратор `@Public()` для открытых endpoints
  - Артефакт: guards зарегистрированы глобально в `AppModule`

- `[H]` 🔴 CRITICAL PATH — `GpTokenGuard` — stateless токен ГП (⚠️ ADR-009)
  - Валидация `gp_submission_token` из `periods`
  - Блокировка после `gp_submitted_at IS NOT NULL`
  - Блокировка после `gp_token_expires_at < NOW()`
  - Rate limiting: `@Throttle(10, 60)` (активен с первого деплоя)
  - Артефакт: `apps/api/src/auth/gp-token.guard.ts`

- `[M]` UsersModule — CRUD пользователей (только Admin)
  - `GET /users`, `POST /users`, `PATCH /users/:id`, `DELETE /users/:id` (soft delete `is_active=false`)

### 2.3 Multi-tenancy middleware (⚠️ ADR-012)

- `[H]` 🔴 CRITICAL PATH — Реализовать стратегию из ADR-012
  - Если RLS: Prisma `$extends` + SET LOCAL при каждой транзакции
  - Если `organization_id`: Prisma middleware добавляет фильтр ко всем queries
  - **Все последующие сервисы зависят от этого слоя**
  - Артефакт: `apps/api/src/prisma/tenant.middleware.ts`
  - Критерий: пользователь tenant A не видит данных tenant B — проверено тестом

---

## Этап 3 — Backend: Инициализация объекта (Блок A)

> **Цель:** Admin может создать объект, загрузить BoQ с весами — и система проверяет инварианты.  
> **Критерий перехода:** `SUM(weight_coef) == 1.0` гарантируется; объект переходит в статус `initialized`.

- `[H]` 🔴 CRITICAL PATH — `ObjectsModule`
  - `POST /objects` — создание паспорта (L1): name, class, permit_number, connection_date
  - `GET /objects`, `GET /objects/:id`
  - `POST /objects/:id/participants` — SCD Type 2: сохранить `valid_from/valid_to/is_current`
  - Артефакт: `apps/api/src/objects/objects.module.ts`

- `[H]` 🔴 CRITICAL PATH — `SystemConfigModule`
  - `GET /config` — все 11 параметров L0
  - `PATCH /config` — только `@Roles('admin')`
  - Артефакт: `apps/api/src/system-config/system-config.module.ts`

- `[H]` 🔴 CRITICAL PATH — `BoQModule` — версионирование BoQ (Блок G, ⚠️ ADR-006)
  - `POST /objects/:id/boq` — создать BoQ v1.0 с позициями
  - Каждый `boq_item` получает `work_lineage_id = randomUUID()` (новая позиция)
  - `GET /objects/:id/boq/active` — текущая активная версия
  - `GET /objects/:id/boq-versions` — журнал версий
  - Триггер `trg_boq_items_weight_coef` проверяется на уровне DB; сервис читает ошибку и пробрасывает 422
  - Артефакт: `apps/api/src/boq/boq.module.ts`
  - Критерий: POST с `SUM(weight_coef) != 1.0` возвращает 422 с понятным сообщением

- `[M]` L2-документы: `POST /objects/:id/documents` — загрузка ССР/РДЦ/калплана в S3
  - Артефакт: `apps/api/src/documents/documents.module.ts`

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

---

## Этап 8 — Web Frontend

> **Цель:** Admin и Director могут использовать систему через браузер; SC вводит данные с desktop.  
> **Критерий перехода:** happy path цикла периода проходит в браузере без ошибок в консоли.

### 8.1 Фундамент

- `[H]` Инициализировать `apps/web` (React + Vite + TypeScript)
  - TanStack Query для server state; React Router v6
  - Axios interceptors: attach Bearer token; обработка 401 → refresh → retry
  - Артефакт: `apps/web/src/main.tsx` + `QueryClient` конфигурация

- `[H]` Auth страницы: Login, автоматический refresh, logout
  - HTTP-only cookie refresh (Axios `withCredentials: true`)

### 8.2 Критические экраны (MVP)

- `[H]` 🔴 CRITICAL PATH — `Dashboard /dashboard`
  - Читает из `mv_object_current_status`
  - Отображает `is_stale` флаг если MV устарел (⚠️ ADR-004)
  - Таблица объектов: `obj_readiness_pct`, `weighted_forecast_date`, `critical_path_forecast_date`, `gap_flag`

- `[H]` 🔴 CRITICAL PATH — Страница объекта `/objects/:id`
  - Текущий период, статус, последний снимок
  - Кнопки: Открыть период, Закрыть период (с блокировками по ролям)

- `[H]` 🔴 CRITICAL PATH — Карточка вида работ (§4.3 arch)
  - Плановый объём / факт до периода / остаток / плановый темп
  - Поле ввода `sc_volume` (активно только при open периоде)
  - Флаг «Спорное» (Тип 2) с обязательным reason + фото
  - Прогресс-бар `pct_ready` (MAX 100%)
  - История периодов с маркировкой версий BoQ

- `[H]` 🔴 CRITICAL PATH — Журнал расхождений `/objects/:id/discrepancies`
  - Список Type 1/2/3; статусы; кнопки действий по роли
  - **НЕ виден ГП** (изоляция, §8.3 arch)

- `[M]` `/admin/config` — Конфигурация L0 (11 параметров)
  - Только `@Roles('admin')` — форма редактирования с валидацией

- `[M]` `/admin/objects/:id/participants` — Участники проекта, история смены ГП (SCD Type 2)

- `[M]` `/objects/:id/boq-versions` — Журнал версий BoQ

- `[M]` `/objects/:id/baseline-updates` — Запросы UpdateBaseline (список + approve для Admin)

### 8.3 GP Form (stateless, отдельная страница)

- `[H]` 🔴 CRITICAL PATH — `/gp/submit/:token`
  - Лёгкая страница без авторизации
  - 2 поля на позицию: `gp_volume` + `note`
  - Подтверждение отправки; блокировка повторной подачи
  - Артефакт: `apps/web/src/pages/GpSubmitPage.tsx`

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

## Этап 10 — Безопасность и hardening

> **Цель:** система соответствует требованиям §8 архитектуры; проходит security checklist.

### 10.1 DB-level hardening

- `[H]` Проверить и зафиксировать `REVOKE UPDATE,DELETE ON period_facts FROM ccip_app` (⚠️ P-25, ADR-007)
- `[H]` Проверить `REVOKE UPDATE,DELETE ON audit_log FROM ccip_app` (⚠️ P-25, ADR-007)
- `[H]` Подтвердить работу `fn_admin_correct_fact()` (SECURITY DEFINER) — единственный путь изменения закрытых фактов
- `[H]` Проверить все partial UNIQUE indexes: `uq_boq_versions_active`, `uq_zero_reports_approved`, `uq_object_participants_current`
- `[M]` Создать роль `ccip_readonly` с правами только SELECT — для аналитических запросов

### 10.2 Application-level hardening

- `[H]` Rate limiting: `@Throttle` на все публичные endpoints; `@Throttle(10, 60)` на `/gp/submit/:token`
- `[H]` Helmet middleware: CSP, HSTS, X-Frame-Options
- `[H]` Валидация размера и типа файлов при загрузке фото/документов
- `[H]` Geo/timestamp валидация фото: `taken_at` в пределах `verificationDate ± 1 день`
- `[M]` Сканирование зависимостей: `npm audit` / `snyk` в CI pipeline
- `[M]` Secrets rotation plan: JWT secrets, DB password, S3 keys

### 10.3 RBAC audit

- `[H]` Написать матрицу тестов по RBAC-матрице из §8.2 arch — каждая строка = тест
  - Пример: `stroycontrol` не может `approve_zero_report` → 403
  - Пример: `director` не может `PATCH /config` → 403
  - Пример: ГП token не может `GET /discrepancies` → 403

### 10.4 Audit trail completeness

- `[H]` Убедиться, что все write-операции пишут в `audit_log` через `AuditLogService`
- `[H]` Health-check endpoint `GET /health/audit-log` — проверяет `audit_log_default` partition пустая (⚠️ ADR-010)
- `[M]` pg_partman: `create_parent(p_premake := 3)` — создать партиции на 3 месяца вперёд

---

## Этап 11 — Тестирование

> **Цель:** критический путь покрыт тестами; инварианты гарантированы автоматически.

### 11.1 Unit-тесты (Jest)

- `[H]` `AnalyticsService`: `pct_ready` не превышает 100%; WMA с decay_factor; критический путь forecast
- `[H]` `BoQService`: SUM(weight_coef) == 1.0 при создании и обновлении
- `[H]` `SlaSchedulerService`: idempotent recovery; jobId deduplication
- `[H]` `SyncService`: конфликт по version (не timestamp); `last-write-wins` невозможен
- `[M]` `DisputeService`: автоматический Тип 3 по `N_flag_threshold` за `M_flag_window`
- `[M]` `GpTokenGuard`: истечение токена; одноразовость

### 11.2 Интеграционные тесты (реальная PostgreSQL, ⚠️ ADR-001 — no mocks)

- `[H]` Full period cycle: open → GP submit → SC verify → close → snapshot created in same TX
- `[H]` Concurrency: `pg_advisory_xact_lock` — 2 параллельных запроса на открытие периода; один отклоняется
- `[H]` Period immutability: `ccip_app` не может UPDATE `period_facts` напрямую → DB error
- `[H]` Audit log: `ccip_app` не может DELETE из `audit_log` → DB error
- `[H]` BoQ cross-version query: `work_lineage_id` возвращает корректный кумулятивный факт через 2 версии
- `[H]` SLA recovery scan: убить Redis jobs → рестарт worker → все pending jobs восстановлены
- `[M]` Offline sync conflict: device version != server version → conflict response (не applied)
- `[M]` MV staleness: exhausted retries → `is_stale=TRUE`; self-healing cron → re-queue

### 11.3 E2E тесты (Playwright для Web)

- `[H]` 🔴 CRITICAL PATH — Happy path: login → create object → BoQ → 0-отчёт → период → подача ГП → закрытие → дашборд обновился
- `[M]` Type 2 deadlock Сценарий A: тип 2 → force_close через BullMQ delay (с временным ускорением в тесте)
- `[M]` Конфликт авторизации: director пытается открыть период → 403; страница показывает ошибку

### 11.4 Performance

- `[M]` `getCumulativeFactsBatch()` — benchmark с 50 позиций × 10 версий BoQ → < 100ms
- `[M]` `REFRESH MATERIALIZED VIEW CONCURRENTLY` — benchmark с 100 объектами → SLA
- `[L]` Load test: 50 SC одновременно открывают периоды → нет deadlock, нет потери данных

---

## Этап 12 — Production-инфраструктура

> **Цель:** система развёрнута в Kubernetes; Redis с AOF; резервное копирование настроено.

### 12.1 Kubernetes manifests

- `[H]` `Deployment` для NestJS API: `replicas: 2+`; `livenessProbe` + `readinessProbe`
- `[H]` 🔴 CRITICAL PATH — `Deployment` для SLA Worker: **`replicas: 1`, `strategy: Recreate`** (⚠️ ADR-005)
  - `terminationGracePeriodSeconds: 30`; BullMQ `lockDuration: 60s > 30s`
  - Метка `env: WORKER_ROLE=worker` — изолировать от API процессов
- `[H]` Managed PostgreSQL 16: `pool_mode=session` PgBouncer (⚠️ ADR-001, ADR-002)
  - **НЕ** transaction-mode; **НЕ** AWS RDS Proxy
- `[H]` Redis Cluster с **AOF-persistence** (⚠️ ADR-005): `appendonly yes`; `appendfsync everysec`
- `[H]` S3 bucket: lifecycle policy для photos (теплое хранилище через 90 дней)
- `[M]` CDN для Web App (CloudFront / CloudFlare)
- `[M]` Ingress + TLS (cert-manager, Let's Encrypt)
- `[M]` HorizontalPodAutoscaler для API (не для Worker)

### 12.2 Секреты и конфигурация

- `[H]` Kubernetes Secrets: JWT secrets, DB password, Redis password, S3 keys
- `[H]` ConfigMap: не-секретные env vars
- `[M]` External Secrets Operator или HashiCorp Vault для rotation

### 12.3 Резервное копирование

- `[H]` PostgreSQL: ежедневный `pg_dump` + WAL archiving → S3; проверка восстановления
- `[H]` Redis: AOF backup в S3 (раз в час); тест восстановления SLA jobs
- `[H]` S3 bucket versioning для фото/документов

### 12.4 Observability

- `[H]` Structured logging (JSON): `correlation_id` на каждый HTTP-запрос
- `[H]` Метрики: `api_request_duration_ms`, `bullmq_job_duration_ms`, `mv_refresh_lag_seconds`
- `[H]` Алерты:
  - `mv_refresh_log.is_stale = TRUE > 10 min`
  - `audit_log_default partition COUNT(*) > 0`
  - SLA Worker pod restart
  - Redis AOF `aof_rewrite_in_progress` stuck
- `[M]` Distributed tracing (OpenTelemetry → Jaeger/Tempo)
- `[M]` `GET /health` endpoint: DB ping, Redis ping, BullMQ queue depth, MV staleness

### 12.5 pg_partman

- `[H]` `pg_partman.create_parent('audit_log', 'performed_at', p_premake := 3)` — партиции на 3 месяца вперёд
- `[H]` Cron для `pg_partman.run_maintenance()` — раз в сутки
- `[H]` Алерт на непустую `audit_log_default` partition (⚠️ ADR-010)

---

## Этап 13 — Пилотная эксплуатация

> **Цель:** 1 реальный объект, 1-2 месяца, полный цикл от инициализации до закрытого периода с расхождениями.  
> **Критерий успеха:** Director видит обновлённый дашборд через < 30 сек после закрытия периода; ни одного потерянного SLA-события.

### 13.1 Pre-launch checklist

- `[H]` 🔴 CRITICAL PATH — Все H-приоритетные задачи этапов 0-12 выполнены
- `[H]` RBAC matrix тест пройден полностью (все строки §8.2)
- `[H]` Period immutability тест: DB-level REVOKE подтверждён
- `[H]` SLA recovery тест: убить Redis → рестарт → jobs восстановлены
- `[H]` BullMQ Worker: `replicas: 1`, `strategy: Recreate` подтверждено в K8s
- `[H]` `REFRESH MATERIALIZED VIEW CONCURRENTLY` работает без блокировки дашборда
- `[H]` `audit_log_default` partition пуста до запуска данных
- `[H]` Backup restore drill: восстановить БД из бэкапа за < 1 час

### 13.2 Data onboarding пилотного объекта

- `[H]` Admin создаёт объект, загружает BoQ (≥5 позиций с реальными `weight_coef`)
- `[H]` Admin загружает L2-документы (РДЦ, календарный план)
- `[H]` SC создаёт и утверждает 0-отчёт (Director утверждает)
- `[H]` Открыт первый период; ГП получает email с XLS-шаблоном

### 13.3 Мониторинг пилота

- `[H]` Дашборд метрик включён; алерты настроены
- `[H]` Ежедневная проверка `audit_log_default` partition на пустоту
- `[M]` Еженедельный review: количество конфликтов sync, количество SLA-событий, время MV refresh
- `[M]` Фидбек SC с mobile по UX конфликт-резолюции

### 13.4 Критерии выхода из пилота (перед production rollout)

- `[H]` ≥2 полных цикла периода (open → ГП submit → SC verify → close) завершены
- `[H]` ≥1 Type 2 расхождение обработано через SLA (включая автоматический Сценарий A)
- `[H]` ≥1 sync-конфликт обнаружен и разрешён вручную SC
- `[H]` Нет потерянных SLA-событий (проверка `sla_events WHERE executed_at IS NULL AND scheduled_at < NOW()`)
- `[M]` ≥1 UpdateBaseline выполнен; аналитика пересчитана корректно
- `[M]` Admin-корректировка закрытого периода: каскадный пересчёт снимков проверен на реальных данных

---

## Сводная таблица: Минимально необходимые задачи перед MVP

| # | Задача | Этап | Блокирует |
|---|--------|------|-----------|
| 1 | ADR-012 Multi-tenancy принят | 0 | Всё |
| 2 | Docker Compose + PostgreSQL + Redis (AOF) + PgBouncer (session) | 1 | Всё |
| 3 | Prisma schema из P-01..P-25 | 1 | Всё |
| 4 | Auth: JWT + RBAC Guards + GpTokenGuard | 2 | Все API |
| 5 | AuditLogService (append-only) | 2 | Immutability |
| 6 | Multi-tenancy middleware | 2 | Все сервисы |
| 7 | Init-модуль A: Objects + BoQ + weight_coef trigger | 3 | B, C, D, E |
| 8 | ZeroReport-модуль B | 4 | C |
| 9 | PeriodEngine-модуль C: open + GP submit + SC verify + close | 5 | D, E |
| 10 | DisputeSLA-модуль D + BullMQ Worker (ROLE=worker) | 5 | E, MV |
| 11 | AnalyticsEngine-модуль E + MV refresh | 5 | Dashboard |
| 12 | Web: Dashboard + Period cycle + GP Form | 8 | Pilot |
| 13 | Period immutability: REVOKE проверен | 10 | Pilot |
| 14 | SLA recovery scan тест | 11 | Pilot |
| 15 | K8s Worker: replicas:1 + Recreate | 12 | Pilot |

---

## Зависимости между блоками (DAG)

```
[0 ADR-012]
     │
     ▼
[1 Repos + Docker + Prisma]
     │
     ▼
[2 Auth + AuditLog + Tenant]
     │
     ├──────────────────────────────────────────────┐
     ▼                                              │
[3 Init A: Objects + BoQ]                          │
     │                                              │
     ▼                                              │
[4 ZeroReport B]                                   │
     │                                              │
     ▼                                              ▼
[5.1 PeriodEngine C]                    [6 Baseline F/G + GC Change H]
     │                                              │
     ├──────────────────┐                           │
     ▼                  ▼                           │
[5.2 Disputes+SLA D]  [7 Sync API I]               │
     │                  │                           │
     ▼                  │                           │
[5.3 Analytics E]       │                           │
     │                  │                           │
     ├──────────────────┘                           │
     ▼                                              │
[8 Web App]◄───────────────────────────────────────┘
     │
     ├──────────────────┐
     ▼                  ▼
[9 Mobile App]    [10 Security]
     │                  │
     └──────┬───────────┘
            ▼
      [11 Testing]
            │
            ▼
      [12 Prod Infra]
            │
            ▼
      [13 Pilot]
```

---

*Документ составлен на основе: `architecture_v1_0.md` · ADR-001..011 · schema.sql (P-01..P-25)*  
*Все задачи с `[H]` обязательны перед соответствующим критерием перехода.*
