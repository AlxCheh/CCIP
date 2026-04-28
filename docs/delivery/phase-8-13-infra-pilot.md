# CCIP — Delivery: Phases 8, 10–13 — Web · Security · Testing · Infra · Pilot

**Требует:** Этапы 4–7 завершены → [phase-4-7-backend-modules.md](phase-4-7-backend-modules.md)  
**Critical path:** [critical-path.md](critical-path.md)

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

- `[M]` `/admin/config` — Конфигурация L0 (11 параметров), только `@Roles('admin')`
- `[M]` `/admin/objects/:id/participants` — Участники проекта, история смены ГП (SCD Type 2)
- `[M]` `/objects/:id/boq-versions` — Журнал версий BoQ
- `[M]` `/objects/:id/baseline-updates` — Запросы UpdateBaseline (список + approve для Admin)

### 8.3 GP Form (stateless, отдельная страница)

- `[H]` 🔴 CRITICAL PATH — `/gp/submit/:token`
  - Лёгкая страница без авторизации; 2 поля на позицию: `gp_volume` + `note`
  - Подтверждение отправки; блокировка повторной подачи
  - Артефакт: `apps/web/src/pages/GpSubmitPage.tsx`

---

## Этап 10 — Безопасность и hardening

> **Цель:** система соответствует требованиям §8 архитектуры; проходит security checklist.

### 10.1 DB-level hardening

- `[H]` Проверить `REVOKE UPDATE,DELETE ON period_facts FROM ccip_app` (⚠️ P-25, ADR-007)
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
- `[H]` Managed PostgreSQL 16: `pool_mode=session` PgBouncer (⚠️ ADR-001, ADR-002) — **НЕ** transaction-mode; **НЕ** AWS RDS Proxy
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

- `[H]` 🔴 CRITICAL PATH — Все H-приоритетные задачи этапов 0–12 выполнены
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

### 13.4 Критерии выхода из пилота (перед production rollout)

- `[H]` ≥2 полных цикла периода (open → ГП submit → SC verify → close) завершены
- `[H]` ≥1 Type 2 расхождение обработано через SLA (включая автоматический Сценарий A)
- `[H]` ≥1 sync-конфликт обнаружен и разрешён вручную SC
- `[H]` Нет потерянных SLA-событий (проверка `sla_events WHERE executed_at IS NULL AND scheduled_at < NOW()`)
- `[M]` ≥1 UpdateBaseline выполнен; аналитика пересчитана корректно
- `[M]` Admin-корректировка закрытого периода: каскадный пересчёт снимков проверен на реальных данных
