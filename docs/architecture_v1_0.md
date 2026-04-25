# CCIP — Архитектурный документ

**Construction Control & Intelligence Platform**
*На основе: Концепция v1.5 · Алгоритм v1.3 · Schema PostgreSQL 16 (P-01..P-32)*
*Дата составления: 2026-04-23 · Обновлён: 2026-04-25 (rev 3 — ADR-012..014, §10.4 закрыт)*

---

## 1. Общее архитектурное представление

### 1.1 Назначение системы

CCIP — SaaS-платформа для оцифровки, верификации и аналитики объектов капитального строительства. Ключевая бизнес-ценность: Заказчик получает **верифицированный факт** выполнения работ от независимого строительного контроля, а не самооценку Генерального подрядчика. Система является единственным источником истины о прогрессе строительства.

### 1.2 Архитектурный стиль

| Аспект | Решение |
|--------|---------|
| Общий стиль | **Модульный монолит** с выделенными сервисными слоями (на стадии проектирования — монолит, с заделом на микросервисы) |
| Данные | **Event-sourced partial** — закрытые периоды иммутабельны; все изменения через audit_log |
| Мобильный клиент | **Offline-first** с локальной очередью синхронизации (WatermelonDB) |
| Аналитика | **Read-model отделён от Write-model** (materialized view для дашборда, снимки `readiness_snapshots`) |
| Фоновые процессы | **Event-driven** через очередь (SLA-таймеры через Redis/BullMQ; recovery scan при старте) |

### 1.3 Ключевые бизнес-модули

```
┌──────────────────────────────────────────────────────────────────┐
│                          CCIP Platform                           │
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐  ┌─────────┐ │
│  │ Инициализа-│  │  0-отчёт   │  │  Period      │  │Analytics│ │
│  │ ция (A)    │  │  Engine(B) │  │  Engine(C-D) │  │Engine(E)│ │
│  └────────────┘  └────────────┘  └──────────────┘  └─────────┘ │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐  ┌─────────┐ │
│  │ Baseline   │  │  BoQ       │  │  Contractor  │  │ Offline │ │
│  │ Update (F) │  │  Version(G)│  │  Change (H)  │  │ Sync (I)│ │
│  └────────────┘  └────────────┘  └──────────────┘  └─────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Структура модулей

### 2.1 Четырёхуровневая модель данных (сквозная для всей системы)

| Уровень | Название | Зона ответственности | Изменяемость |
|---------|----------|----------------------|--------------|
| **L0** | Конфигурация системы | 11 глобальных параметров алгоритма | Только Admin; влияет на все расчёты |
| **L1** | Паспорт объекта | Идентификация ОКС, участники, разрешение | Immutable после создания (участники — SCD Type 2) |
| **L2** | Проектная документация | BoQ, РДЦ, ССР, календарный план | Версионируется при любом изменении |
| **L3** | Текущий статус | 0-отчёт, периоды, факт, расхождения | Активный период — изменяемый; закрытый — immutable |

### 2.2 Алгоритмические блоки и межмодульные зависимости

| Блок | Функция | Входящие зависимости | Исходящие зависимости |
|------|---------|---------------------|----------------------|
| **A — Init** | Инициализация L0–L2, импорт BoQ | — | B (разблокирует 0-отчёт) |
| **B — ZeroReport** | Стартовый факт, верификация, таймер | A (L2 готов) | C (разблокирует первый период) |
| **C — PeriodCycle** | Открытие → ГП → SC → Закрытие | B (approved), D (resolve disputes) | D, E |
| **D — Disputes+SLA** | Тип 1/2/3, deadlock A/B | C (triggered) | C (unblocks close), E |
| **E — Analytics** | % готовности, WMA, два прогноза, флаги | C (closed period) | Dashboard read-model |
| **F — UpdateBaseline** | Изменение plan_volume | C (period closed) | G (создаёт версию BoQ) |
| **G — BoQVersioning** | Версия BoQ при любом изменении L2 | F, Admin actions | C (следующий период с новой версией) |
| **H — GCChange** | Смена ГП (SCD Type 2) | C (period closed, 0 disputes) | C (новый ГП получает шаблоны) |
| **I — OfflineSync** | Очередь → конфликт → решение SC | C (может блокировать) | C, D |

---

## 3. Backend-архитектура

### 3.1 Технологический стек (принятый)

| Компонент | Технология | Статус выбора |
|-----------|-----------|---------------|
| СУБД | PostgreSQL 16 | Finalized |
| Backend framework | **NestJS (TypeScript) + Prisma** | Finalized — см. ADR-001 |
| Очереди / SLA | **Redis + BullMQ** (AOF-persistence обязательна) | Finalized — см. ADR-001, ADR-005 |
| Connection pooler | PgBouncer `pool_mode=session` (или прямое соединение) | Finalized — см. ADR-001 |
| Файловое хранилище | S3-совместимое (MinIO / AWS S3) | Finalized |
| Auth | JWT (Access 15min + Refresh 30d) + RBAC Guards + `refresh_tokens` в БД | Finalized — см. ADR-009 |

### 3.2 Сервисные слои (проектный уровень)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         API Gateway / Router                        │
│              (REST HTTP, RBAC middleware, JWT validation)            │
├──────────┬──────────┬──────────┬──────────┬────────────┬────────────┤
│  Init    │  Zero    │  Period  │  Dispute │  Analytics │  Baseline  │
│  Service │  Report  │  Engine  │  &SLA    │  Engine    │  Update    │
│          │  Service │  Service │  Service │  Service   │  Service   │
├──────────┴──────────┴──────────┴──────────┴────────────┴────────────┤
│                     Domain Layer (Business Logic)                    │
│    Formulas: pct_ready, WMA pace, forecast_weighted/critical         │
│    Invariants: SUM(weight_coef)==1.0, period immutability            │
├─────────────────────────────────────────────────────────────────────┤
│                     Data Access Layer (Repository)                   │
│                   PostgreSQL 16 (Triggers, Partitions)               │
├─────────────────────────────────────────────────────────────────────┤
│  SLA Scheduler       │  File Storage         │  Notification Queue   │
│  (BullMQ, ROLE=worker│  (S3 / MinIO)         │  (Redis / SMTP)       │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 Критические бизнес-правила на уровне бэкенда

**Блокировки (жёсткие):**
- Открытие первого периода → заблокировано без `zero_reports.status = 'approved'`
- Закрытие периода → заблокировано при `COUNT(disputes WHERE status='open') > 0`
- UpdateBaseline / смена версии BoQ / смена ГП → только при `period.status != 'open'`
- Удаление позиции BoQ с `fact_volume > 0` → заблокировано; предлагается `excluded_from_scope` или merge

**Инварианты (должны поддерживаться сервисом):**
- `SUM(boq_items.weight_coef) == 1.0` — поддерживается триггером `trg_boq_items_weight_coef`
- `pct_ready = MIN(fact/plan×100, 100)` — не превышает 100% на уровне вида работ
- Закрытый период физически не изменяется — только Admin через `adminCorrectFact()` + `audit_log` + **каскадный пересчёт** всех последующих снимков (см. ADR-007)
- `audit_log` и `period_facts` — `REVOKE UPDATE, DELETE` для роли `ccip_app`; изменение `period_facts` только через `SECURITY DEFINER fn_admin_correct_fact()` (P-25, ADR-007)
- Конфликт офлайн-данных — `last-write-wins` запрещён; детекция по `version` (все офлайн-поля: `sc_volume`, `discrepancy_type`, `note`); конфликт в закрытом периоде — эскалация в Admin через `discrepancies` (см. ADR-003)
- Конкурентное открытие периода — `pg_advisory_xact_lock` (md5-hash) внутри транзакции; клиент retry с backoff (см. ADR-002)
- `readiness_snapshots` создаётся **внутри транзакции** `closePeriod` — нет закрытого периода без снимка (DB-level гарантия)

### 3.4 SLA Scheduler — архитектура событий

Полный контракт надёжности (jobId deduplication, recovery scan, K8s Recreate, lockDuration) — см. **ADR-005**.

```
Тип 2 выставлен (day 0)
  → INSERT sla_events (scenario='A', event_type='notify_director_day3', scheduled_at=+3d)
  → INSERT sla_events (scenario='A', event_type='force_close_day5',     scheduled_at=+5d)
  → BullMQ.add(jobId='sla-{event.id}', delay=Δt, attempts=3)

BullMQ Worker (idempotent):
  → day 3: NOTIFY director; UPDATE sla_events SET executed_at = NOW()
  → day 5: SET work.status='forced_sc_figure', period.status='force_closed'

При потере Redis: onModuleInit() recovery scan (только ROLE=worker) находит sla_events WHERE executed_at IS NULL
                  (и прошедшие, и будущие) и пересоздаёт jobs. Просроченные — delay=0, выполняются немедленно.
                  jobId-deduplication = no-op для уже существующих jobs.

Сценарий B (ГП ответил, SC не принял):
  → INSERT sla_events (scenario='B', event_type='director_deadline_day7',  scheduled_at=+7d)
  → INSERT sla_events (scenario='B', event_type='sc_figure_applied_day14', scheduled_at=+14d)
```

### 3.5 Внешний доступ ГП (stateless token)

ГП не имеет учётной записи в системе. Полный контракт (Guard, одноразовость, истечение) — см. **ADR-009**.

- `periods.gp_submission_token` (UUID) генерируется при открытии периода
- `periods.gp_token_expires_at = sla_force_close_at - 1h` — выровнен с SLA-дедлайном; буфер 1 час исключает гонку с force_close
- Одноразовый: после `gp_submitted_at IS NOT NULL` повторная подача блокируется
- `GpTokenGuard` валидирует токен; эндпоинт не требует JWT
- Rate limiting: `@Throttle(10, 60)` — активен с первого деплоя

---

## 4. Frontend-архитектура

### 4.1 Клиентские приложения

| Приложение | Платформа | Роли-пользователи | Приоритет UX |
|-----------|----------|-------------------|--------------|
| **Web App** | React + TanStack Query | Admin, Director, SC (офис) | Desktop-first |
| **Mobile App** | React Native + WatermelonDB | SC (объект) | **Mobile-first, offline-first** |
| **GP Form** | Лёгкая web-страница (stateless) | ГП (внешний) | Минимальный — только 2 поля |

### 4.2 Web App — ключевые экраны

```
/dashboard                     — Дашборд директора (mv_object_current_status)
  /objects/:id                 — Страница объекта
    /periods/:id               — Текущий/история периодов
      /works/:work_id          — Карточка вида работ (ввод факта)
    /discrepancies             — Журнал расхождений
    /boq-versions              — Журнал версий BoQ
    /baseline-updates          — Запросы UpdateBaseline
/admin
  /config                      — Конфигурация L0 (system_config)
  /objects/:id/participants    — Участники проекта, смена ГП
```

### 4.3 Карточка вида работ (критический UX-компонент)

Согласно §7.1 концепции, карточка содержит:

| Элемент | Источник данных | Поведение |
|---------|----------------|-----------|
| Шапка (раздел, ед. изм., период) | `boq_items`, `periods` | Read-only |
| Плановый объём / факт до периода / остаток / плановый темп | `boq_items`, предыдущий `period_facts` | Read-only |
| Поле ввода объёма за период | `period_facts.sc_volume` | Активно пока период открыт |
| Флаг «Спорное» (снятие = Тип 2) | `period_facts.discrepancy_type` | Требует основания + фото |
| Прогресс-бар `pct_ready` | `MIN(fact/plan×100, 100)` | Максимум 100% |
| История периодов | `period_facts` по `work_lineage_id` | Лента с маркировкой версий BoQ |

### 4.4 Mobile App — Offline-first архитектура

```
┌─────────────────────────────────────────────────────┐
│             React Native App (SC device)             │
│                                                      │
│  ┌──────────────────┐    ┌────────────────────────┐ │
│  │  UI Components   │    │  WatermelonDB (SQLite)  │ │
│  │  (Forms, Photos, │◄──►│  Local schema mirror    │ │
│  │   Checklists)    │    │  + offline action queue │ │
│  └──────────────────┘    └────────────────────────┘ │
│              │                       │               │
│              └───────────────────────┘               │
│                           │                          │
│                    Sync Manager                      │
│              (when network available)                │
│                           │                          │
└───────────────────────────┼──────────────────────────┘
                            │ HTTP POST /sync
                            ▼
                     Backend API
                     sync_queue table
```

**Операции доступные офлайн:** `submit_fact`, `upload_photo`, `add_discrepancy_note`, `open_period` (идемпотентно — дубль в очереди заменяется)
**Только онлайн:** `close_period`, `submit_gp_template`, `approve_zero_report`
**Sync каналы:** `/sync/operations` (JSON-данные) + `/sync/photos` (multipart, по одному, resumable)
**BoQ version gating:** каждая операция несёт `boqVersionNumber`; сервер reject-ит при расхождении с активной версией

### 4.5 State Management

- **Web:** TanStack Query (server state) + локальный React state для форм
- **Mobile:** WatermelonDB (реактивные запросы) + sync queue как отдельная локальная таблица
- **Конфликт-резолюция:** UI показывает обе версии (device vs server) с именами инженеров и датами; SC выбирает вручную с обязательным примечанием

---

## 5. Модель данных

### 5.1 Полная схема сущностей

```
users (id, email, name, role, is_active)
  │
  ├──► system_config (key, value_type, value_numeric/text)
  │                   [L0 — 11 глобальных параметров]
  │
  ├──► objects (id, name, class, permit_number, connection_date, status)
  │     │       [L1 — паспорт объекта]
  │     │
  │     ├──► object_participants (SCD Type 2: org_name, role, valid_from, valid_to, is_current)
  │     │
  │     ├──► l2_documents (doc_type IN ssr/rdc/calendar_plan/other, file_path)
  │     │
  │     ├──► boq_versions (version_number, change_type, is_active)  ─► [L2]
  │     │         │
  │     │         └──► boq_items (work_lineage_id UUID, name, plan_volume, contract_value,
  │     │                         weight_coef, is_critical, status, predecessor_item_id)
  │     │                    [work_lineage_id стабилен через все версии BoQ]
  │     │
  │     ├──► zero_reports (status, submitted_by, approved_by)  ─► [L3-A]
  │     │         │
  │     │         └──► zero_report_items (boq_item_id, fact_volume, source,
  │     │                                 doc1/2/3_value, cross_verified)
  │     │
  │     ├──► periods (period_number, boq_version_id, status, is_zero_period,  ─► [L3-B]
  │     │     │       gp_submission_token, gp_token_expires_at, SLA timestamps)
  │     │     │
  │     │     ├──► period_facts (boq_item_id, gp_volume, sc_volume, accepted_volume,
  │     │     │     │            discrepancy_type, discrepancy_status, overrun_pct, is_spike)
  │     │     │     │
  │     │     │     └──► discrepancies (type, status, gp_position, sc_position,
  │     │     │                         director_decision, resolved_at)
  │     │     │
  │     │     ├──► photos (boq_item_id, file_path, taken_at)
  │     │     │
  │     │     ├──► sla_events (scenario A/B, event_type, scheduled_at, executed_at)
  │     │     │
  │     │     ├──► readiness_snapshots (object_readiness_pct, weighted_forecast_date,
  │     │     │                         critical_path_forecast_date, gap_flag)
  │     │     │
  │     │     └──► work_pace (boq_item_id, period_volume, weighted_pace, is_excluded)
  │     │
  │     ├──► baseline_update_requests (boq_item_id, old/new_plan_volume, reason, status)
  │     │
  │     ├──► forecast_scenarios (parameters JSONB, completion_date)
  │     │
  │     └──► ml_features (period_id, feature_set JSONB, label)
  │
  ├──► notifications (user_id, type, reference_table, reference_id, message, read_at)
  │
  ├──► audit_log PARTITIONED BY RANGE(performed_at) (table_name, record_id, action,
  │              old_data JSONB, new_data JSONB, reason)
  │              [append-only; composite PK (id, performed_at); REVOKE UPDATE/DELETE для ccip_app]
  │
  ├──► refresh_tokens (user_id, token_hash SHA-256, expires_at, revoked_at)
  │              [JWT Refresh Tokens; logout = revoked_at; rotation при каждом refresh]
  │
  ├──► boq_item_lineage_links (source_item_id, lineage_id, weight)
  │              [split/merge поддержка; дополняет boq_items.work_lineage_id]
  │
  └──► sync_queue (device_id, operation, payload JSONB, client_timestamp, status,
                   conflict_data, last_known_version, boq_version_number, is_syncing)
```

### 5.2 Ключевые связи и инварианты БД

| Инвариант | Механизм реализации |
|-----------|---------------------|
| Один активный BoQ на объект | Partial UNIQUE index `uq_boq_versions_active` WHERE is_active=TRUE |
| Один утверждённый 0-отчёт на объект | Partial UNIQUE index `uq_zero_reports_approved` WHERE status='approved' |
| Один текущий участник каждой роли | Partial UNIQUE index `uq_object_participants_current` WHERE is_current=TRUE |
| `period_facts.boq_item_id` принадлежит версии периода | Trigger `trg_period_facts_version_check` |
| `SUM(weight_coef) == 1.0` | Trigger `trg_boq_items_weight_coef` AFTER INSERT/UPDATE |
| `readiness_snapshots.object_id` консистентен с `periods` | Trigger `trg_readiness_snapshots_object_check` |
| Период `period_number` уникален на объект | UNIQUE (object_id, period_number) + pg_advisory_lock |

### 5.3 Потоки данных между компонентами

```
Инициализация:
Admin → [system_config] → [objects] → [object_participants] → [l2_documents]
                                    → [boq_versions(v1.0)] → [boq_items × weight_coef trigger]

0-отчёт:
SC → [zero_reports] → [zero_report_items(source hierarchy)]
Director.approve → [zero_reports.status='approved'] → период разблокирован

Цикл периода:
SC.openPeriod → [periods] → [gp_submission_token] → ГП (email/link)
ГП.submit → [periods.gp_submitted_at] → [period_facts.gp_volume]
SC.verify → [period_facts.sc_volume] → delta → type 1 или type 2
  type 1: [period_facts.accepted_volume=sc_volume] → [notifications → ГП]
  type 2: [discrepancies] → [sla_events] → SLA Scheduler
SC.closePeriod → [periods.status='closed']
              → CalcReadiness → [readiness_snapshots] → [work_pace]
              → REFRESH MATERIALIZED VIEW CONCURRENTLY mv_object_current_status
```

### 5.4 Стратегия кросс-версионной агрегации факта

Проблема: при смене версии BoQ item_id меняется, но история факта должна быть непрерывной.

Решение: `boq_items.work_lineage_id` (UUID) — стабильный идентификатор, наследуется от `predecessor_item_id`. Индекс `idx_boq_items_lineage` обеспечивает O(log n) поиск по всем версиям без рекурсивного CTE.

**Split/merge** (rev 2): при разделении или объединении позиций scalar `work_lineage_id` недостаточен. Таблица `boq_item_lineage_links(source_item_id, lineage_id, weight)` хранит перекрёстные ссылки. `getCumulativeFactsBatch()` объединяет прямой lineage и cross-lineage — **один батч-запрос** вместо N отдельных.

Полный контракт (split/merge, batch query, инварианты) — см. **ADR-006**.

```sql
-- Суммарный факт по виду работ: прямой lineage + cross-lineage (split/merge)
SELECT COALESCE(SUM(pf.accepted_volume), 0)
FROM period_facts pf JOIN boq_items bi ON bi.id = pf.boq_item_id
WHERE bi.work_lineage_id = :lineage_id
UNION ALL
SELECT COALESCE(SUM(pf.accepted_volume * lnk.weight), 0)
FROM period_facts pf JOIN boq_items bi ON bi.id = pf.boq_item_id
JOIN boq_item_lineage_links lnk ON lnk.source_item_id = bi.id
WHERE lnk.lineage_id = :lineage_id AND bi.work_lineage_id != :lineage_id;
```

---

## 6. Интеграции

### 6.1 Внешние акторы и точки интеграции

| Интеграция | Протокол | Направление | Описание |
|-----------|---------|-------------|---------|
| **ГП — подача шаблона** | HTTP (token-based form) | Входящий | Stateless UUID-токен (`gp_submission_token`), истекает по SLA |
| **Email-уведомления** | SMTP / Email API | Исходящий | SLA-события, флаги, уведомления ГП о Тип 1 |
| **S3 / MinIO** | S3 API | Исходящий | Хранение фото (photos.file_path), документов L2 (l2_documents.file_path) |
| **Mobile App → API** | REST HTTP | Входящий / исходящий | Синхронизация sync_queue |
| **BullMQ** | Redis protocol / internal | Внутренний | SLA-таймеры, retry refresh MV, self-healing cron; только ROLE=worker |

### 6.2 Интеграция с BIM (опциональная)

В стандарте верификации §6.5 предусмотрена `BIM-ссылка на элемент модели` — опциональное поле доказательной базы. На уровне схемы БД это поле отсутствует (зарезервировано). *[Предположение]* Может быть реализовано как `photos.bim_element_id` или дополнительная таблица `bim_references`.

### 6.3 Формат данных

- Внутреннее API: REST JSON
- ГП-шаблон: Excel (XLS/XLSX) — генерируется системой при открытии периода, защищённые колонки (только col6 — объём за период, col7 — примечание)
- Отчёты: PDF (генерация не реализована, зарезервировано)
- ML features: JSONB blob в `ml_features.feature_set`

---

## 7. Инфраструктура

### 7.1 Окружения и деплой

| Компонент | Dev | Production |
|-----------|-----|------------|
| Оркестрация | Docker Compose | Kubernetes |
| БД | PostgreSQL 16 (container) | Managed PostgreSQL (RDS/Cloud) |
| Кэш / очереди | Redis (container) | Redis Cluster |
| Хранилище файлов | MinIO (container) | AWS S3 / Cloud Storage |
| Backend | Container (NestJS/FastAPI) | K8s Deployment |
| Web App | Container (Nginx + React build) | K8s Deployment / CDN |
| SLA Scheduler | Container (BullMQ worker) | K8s Deployment (single replica) |

### 7.2 Партиционирование audit_log

Полный контракт (pg_partman, premake=3, архивный tablespace, мониторинг default-партиции) — см. **ADR-010**.

```sql
-- Производительность: ежемесячные партиции
CREATE TABLE audit_log PARTITION BY RANGE (performed_at);
CREATE TABLE audit_log_2026_04 FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE audit_log_default PARTITION OF audit_log DEFAULT;
-- Создание партиций: pg_partman.create_parent(p_premake := 3)
```

### 7.3 Materialized View — стратегия обновления

`mv_object_current_status` обновляется после каждого закрытия периода. Полный контракт (retry через BullMQ, `mv_refresh_log` метаданные, немедленный staleness-флаг при exhausted retries) — см. **ADR-004**.

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_object_current_status;
-- CONCURRENTLY: без блокировки чтения дашборда директора
-- Метаданные refresh: таблица mv_refresh_log (refreshed_at, is_stale)
```

### 7.4 Sync Queue — жизненный цикл записей

Граница offline/online (какие операции допустимы офлайн, какие требуют сети) — см. **ADR-008**.  
Детекция конфликтов через `last_known_version` (не по timestamp) и резолюция SC — см. **ADR-003**.

```
sync_queue.status:
  pending   → applied    (успешно применено)
  pending   → conflict   (period_facts.version != last_known_version)
  pending   → rejected   (BOQ_VERSION_MISMATCH или бизнес-блокировка)
  pending   → escalated  (конфликт в закрытом периоде — передан Admin через discrepancies)
  conflict  → applied    (SC разрешил вручную через POST /sync/resolve)
  conflict  → escalated  (период закрыт, SC не успел резолвить)

Ключевые поля: last_known_version (детекция конфликта), boq_version_number (gating),
               is_syncing (reconciliation при рестарте приложения)

Архивация: записи со status IN ('applied', 'rejected', 'escalated') старше 30 дней
           удаляются scheduled job (не partition — записи short-lived)
```

---

## 8. Безопасность

### 8.1 Аутентификация

Полный контракт реализации (Guards, декораторы, GpTokenGuard, отложенный rate limiting) — см. **ADR-009**.

| Механизм | TTL | Применение |
|---------|-----|-----------|
| JWT Access Token | 15 минут | Authorization header (Bearer) |
| JWT Refresh Token | 30 дней | HTTP-only cookie + хэш SHA-256 в `refresh_tokens`; ротируется; logout = revoked_at |
| GP Submission Token | до SLA-дедлайна − 1h | UUID в URL, одноразовый, не требует auth; rate limited 10 req/min |

### 8.2 Авторизация — RBAC-матрица

| Действие | `stroycontrol` | `director` | `admin` | ГП (token) |
|---------|:--------------:|:-----------:|:-------:|:----------:|
| Открыть/закрыть период | ✓ | — | ✓ | — |
| Ввести верифицированный факт | ✓ | — | ✓ | — |
| Выставить флаг Тип 2 | ✓ | — | ✓ | — |
| Подать шаблон-сводку | — | — | — | ✓ |
| Утвердить 0-отчёт | — | ✓ | — | — |
| Снять флаг Тип 3 | — | ✓ | — | — |
| Решение по Сценарию B deadlock | — | ✓ | ✓ | — |
| Конфигурация L0 (system_config) | — | — | ✓ | — |
| Утвердить UpdateBaseline | — | — | ✓ | — |
| Изменить закрытый период | — | — | ✓ | — |
| Читать дашборд | ✓ | ✓ | ✓ | — |
| Просматривать аналитику | ✓ | ✓ | ✓ | — |

### 8.3 Защита данных

| Аспект | Решение |
|--------|---------|
| **Неизменность истории** | `periods.status='closed'` → UPDATE запрещён app-level + `REVOKE UPDATE,DELETE ON period_facts FROM ccip_app` (P-25); только Admin через `fn_admin_correct_fact()` (SECURITY DEFINER) с записью в `audit_log`; **каскадный пересчёт** всех последующих `readiness_snapshots` (см. ADR-007) |
| **Append-only audit log** | `audit_log` — только INSERT через `AuditLogService`; `REVOKE UPDATE,DELETE ON audit_log FROM ccip_app` (P-25) как DB-backstop |
| **Изоляция ГП** | ГП не имеет доступа к журналу расхождений, системным флагам, WMA-данным |
| **Разграничение директора** | `director` — только read-only; write только через approval flows |
| **Фото-метаданные** | Геотег и timestamp прикладываются автоматически; проверяются по дате верификации ±1 день |
| **Конфиденциальность расхождений** | Журнал расхождений не передаётся ГП согласно §10 концепции |

### 8.4 Целостность данных на уровне БД

- `ON DELETE RESTRICT` на все критичные FK — предотвращает каскадное удаление
- Partial unique indexes для одиночных активных записей (BoQ версия, утверждённый 0-отчёт, текущий участник)
- `CHECK` constraints на все enum-поля (`role`, `status`, `discrepancy_type` и т.д.)
- `pg_advisory_lock(object_id)` при назначении `period_number` — предотвращает race condition при конкурентных запросах

---

## 9. Диаграммы взаимодействия для ключевых бизнес-процессов

### 9.1 Стандартный цикл периода (happy path)

```
Admin/SC         System          ГП (external)       Director
   │                │                  │                  │
   │ OpenPeriod()   │                  │                  │
   │───────────────►│                  │                  │
   │                │ gen token+XLS    │                  │
   │                │─────────────────►│ email: шаблон    │
   │                │                  │                  │
   │                │    gp_submitted  │                  │
   │                │◄─────────────────│                  │
   │ InspectSite()  │                  │                  │
   │───────────────►│                  │                  │
   │ SubmitFact()   │                  │                  │
   │ (sc_volume)    │                  │                  │
   │───────────────►│                  │                  │
   │                │ delta=0→Confirmed│                  │
   │                │ delta≠0,accessible=TRUE→Type1       │
   │                │ notify ГП        │                  │
   │                │─────────────────►│ уведомление Т1   │
   │ ClosePeriod()  │                  │                  │
   │───────────────►│                  │                  │
   │                │ CalcReadiness()  │                  │
   │                │ REFRESH MV       │                  │
   │                │ GenerateReport() │                  │
   │                │────────────────────────────────────►│ обновлён дашборд
```

### 9.2 Сценарий Type 2 → SLA Deadlock A (молчание ГП)

```
SC              System (SLA Scheduler)       Director        Admin
│                       │                       │               │
│ SetFlag(Type2)         │                       │               │
│ +reason+photo          │                       │               │
│──────────────────────►│                       │               │
│                        │ INSERT sla_events     │               │
│                        │ (day+3, day+5)        │               │
│                        │                       │               │
│ (ГП молчит 2 дня)      │                       │               │
│                        │ day3: NOTIFY          │               │
│                        │──────────────────────►│               │
│                        │                       │               │
│                        │ day5: force_close     │               │
│                        │ SET status='forced'   │               │
│                        │ period unblocked      │               │
│◄───────────────────────│                       │               │
│ ClosePeriod() available│                       │               │
```

### 9.3 UpdateBaseline — двухшаговая процедура

```
SC                    System                   Admin
│                        │                       │
│ RequestUpdate(         │                       │
│  work_id, new_vol,     │                       │
│  reason, doc)          │                       │
│──────────────────────►│                       │
│                        │ status='pending'      │
│                        │ NOTIFY admin          │
│                        │──────────────────────►│
│                        │                       │ check period.status
│                        │                       │ if period.open → BLOCK
│                        │                       │ ApproveRequest()
│                        │◄──────────────────────│
│                        │ UPDATE plan_volume    │
│                        │ RECALC weight_coef    │
│                        │ CreateBoQVersion()    │
│                        │ CalcReadiness()       │
│                        │ NOTIFY SC             │
│◄───────────────────────│                       │
```

### 9.4 Офлайн-синхронизация с конфликтом

```
SC Device (offline)     Network          System           Admin
│                          │                │               │
│ [offline actions]        │                │               │
│ submit_fact(P5, w3, 80)  │                │               │
│ upload_photo(...)        │                │               │
│ [stored in sync_queue]   │                │               │
│                          │                │               │
│ [network restored]       │                │               │
│ POST /sync               │                │               │
│─────────────────────────►│────────────────►│               │
│                          │                │ period.status?│
│                          │                │ if 'open':    │
│                          │                │  check conflict│
│                          │                │ conflict found│
│                          │                │ (другой SC    │
│                          │                │  ввёл 75)     │
│◄─────────────────────────│◄───────────────│               │
│ conflict_data={          │                │               │
│  server: {val:75, eng:X} │                │               │
│  device: {val:80, eng:Y} │                │               │
│ }                        │                │               │
│ SC выбирает версию+note  │                │               │
│─────────────────────────►│────────────────►│               │
│                          │                │ APPLY         │
│                          │                │ audit_log     │
```

---

## 10. Архитектурные риски и узкие места

### 10.1 Критические риски

Все принятые риски закрыты соответствующими ADR. Mitigation в таблице — краткая суть; полный контракт в ADR.

| # | Риск | Статус | Mitigation (см. ADR) |
|---|------|:------:|---------------------|
| **R-01** | Backend framework не выбран | Закрыт | NestJS+Prisma+BullMQ; PgBouncer session-mode; Redis AOF — **ADR-001** |
| **R-02** | Конкурентное открытие периодов | Закрыт | `pg_advisory_xact_lock` (md5-hash) + UNIQUE fallback — **ADR-002** |
| **R-03** | Офлайн-конфликты данных | Закрыт | Version counter на всех офлайн-полях + резолюция SC + эскалация в Admin при закрытом периоде — **ADR-003** |
| **R-04** | Дрейф materialized view | Закрыт | BullMQ retry + `mv_refresh_log.is_stale` немедленно + self-healing cron каждые 5 мин — **ADR-004** |
| **R-05** | SLA Scheduler — single point of failure | Закрыт | jobId dedup + recovery scan (все события, включая просроченные, delay=0) + K8s Recreate + DELETE guard на sla_events — **ADR-005** |
| **R-06** | Кросс-версионная агрегация факта | Закрыт | `work_lineage_id` UUID + `boq_item_lineage_links` для split/merge + batch query — **ADR-006** |
| **R-07** | Нарушение неизменности закрытых периодов | Закрыт | App-level guard + DB REVOKE + SECURITY DEFINER + каскадный пересчёт snapshots — **ADR-007** |
| **R-08** | Граница offline/online не определена | Закрыт | WatermelonDB + двухканальный sync + BoQ version gating + idempotent open_period — **ADR-008** |
| **R-09** | Аутентификация ГП без аккаунта | Закрыт | Stateless UUID-токен + GpTokenGuard + refresh_tokens в БД + rate limiting — **ADR-009** |
| **R-10** | Неконтролируемый рост audit_log | Закрыт | pg_partman ежемесячные партиции + premake=3 — **ADR-010** |
| **R-11** | Дорогой live-расчёт аналитики | Закрыт | Pre-computed snapshots в транзакции close + batch queries (нет N+1) + каскадный пересчёт при корректировке — **ADR-011** |

### 10.2 Узкие места масштабирования

| Компонент | Проблема | Решение |
|-----------|---------|---------|
| `audit_log` | Неограниченный рост; запросы по record_id без сжатия | Партиционирование уже заложено; pg_partman для автосоздания партиций; холодные партиции → tablespace или архив |
| `sync_queue` | Накопление при длительном офлайне SC | Scheduled job архивации `applied`/`rejected` > 30 дней; лимит payload размера |
| `REFRESH MATERIALIZED VIEW` | При высоком числе объектов refresh становится долгим | `CONCURRENTLY` уже используется; при >1000 объектов — перейти на инкрементальный подход (per-object snapshot) |
| `boq_items.work_lineage_id` JOIN | При большой истории версий — полный scan по lineage | Индекс `idx_boq_items_lineage` создан; достаточно для 50 позиций × N версий |
| WMA расчёт | При большом окне (`avg_pace_periods=50+`) — дорогой запрос | `work_pace` pre-computed, `idx_work_pace_item_period` WHERE is_excluded=FALSE |

### 10.3 Потенциальные проблемы связности

| Проблема | Описание |
|---------|---------|
| **Версионная связность fact ↔ BoQ** | `period_facts.boq_item_id` ссылается на конкретную версию; при смене BoQ старые fact-записи остаются на старом `boq_item_id`. Кросс-версионный запрос требует JOIN через `work_lineage_id` + `boq_item_lineage_links` (split/merge). |
| **Каскадный пересчёт при Admin-корректировке** | Исправлено в ADR-007 rev 2: `recalcSnapshotCascade()` пересчитывает все последующие снимки после корректировки. Асинхронно, не блокирует HTTP-ответ. |
| **GP Token expiry race** | Закрыто в ADR-009 rev 2: `gpTokenExpiresAt = sla_force_close_at - 1h`. Буфер 1 час исключает гонку ГП с force_close. |
| **Конфликт смены ГП mid-dispute** | Блокировка при наличии `'Оспорено'` покрывает это; уведомление нового ГП о pre-existing спорах требует явной процедуры (не описана). |

### 10.4 Архитектурные пробелы

| Пробел | Статус | Решение |
|--------|:------:|---------|
| Multi-tenancy | **Закрыт** | `organization_id` в WHERE + Prisma TenantExtension + per-org `system_config` — **ADR-012** |
| `system_config` per-object overrides | **Закрыт (defer)** | Per-org config достаточен для MVP/pilot; per-object overrides отложены — зафиксировано в **ADR-012** |
| PDF-генерация отчётов | **Закрыт** | Puppeteer + Handlebars + BullMQ async + S3 — **ADR-013** |
| Push-уведомления для Mobile | **Закрыт** | Firebase Cloud Messaging (FCM) + `device_tokens` + `NotificationService` расширен — **ADR-014** |
| ML-модули | **Закрыт (defer)** | `ml_features` / `forecast_scenarios` — только сбор данных; обучение pipeline вне скоупа MVP и пилота; решение пересмотреть после 6 месяцев данных |
| Performance contract БД | **Закрыт** | `DB_POOL_SIZE` per pod, batch query rule, SLA транзакций — **ADR-001 rev 2** |

---

## 11. Реестр архитектурных решений (ADR)

Все ADR находятся в `docs/decisions/`. Каждый ADR — однострочное решение с обоснованием, отклонёнными альтернативами и контрактом реализации.

| # | Тема | Статус | Закрытый риск | Файл |
|---|------|:------:|:-------------:|------|
| 001 | Backend Framework (NestJS+Prisma+BullMQ); performance contract; ROLE=worker | Принято rev 2 | R-01 | `decisions/ADR-001-backend-framework.md` |
| 002 | Конкурентное открытие периодов (advisory lock + md5-hash + UX retry + idempotent offline) | Принято rev 2 | R-02 | `decisions/ADR-002-period-concurrency.md` |
| 003 | Офлайн-конфликты (version counter на всех офлайн-полях + эскалация в закрытом периоде) | Принято rev 2 | R-03 | `decisions/ADR-003-offline-conflict-resolution.md` |
| 004 | Materialized View staleness (`mv_refresh_log` + self-healing cron + fixed manual jobId) | Принято rev 2 | R-04 | `decisions/ADR-004-materialized-view-staleness.md` |
| 005 | SLA Scheduler (recovery scan включает просроченные + DELETE guard + ROLE=worker) | Принято rev 2 | R-05 | `decisions/ADR-005-sla-scheduler-reliability.md` |
| 006 | BoQ Versioning (`work_lineage_id` + `boq_item_lineage_links` для split/merge + batch) | Принято rev 2 | R-06 | `decisions/ADR-006-boq-versioning.md` |
| 007 | Period Immutability + каскадный пересчёт + DB REVOKE + SECURITY DEFINER | Принято rev 2 | R-07 | `decisions/ADR-007-period-immutability.md` |
| 008 | WatermelonDB + двухканальный sync + BoQ version gating + bulk resolve | Принято rev 2 | R-08 | `decisions/ADR-008-watermelondb-offline.md` |
| 009 | RBAC + GP Stateless Token + refresh_tokens в БД + rate limiting включён | Принято rev 2 | R-09 | `decisions/ADR-009-rbac-gp-token.md` |
| 010 | Audit Log партиционирование (composite PK + health-check endpoint) | Принято rev 2 | R-10 | `decisions/ADR-010-audit-log-partitioning.md` |
| 011 | Pre-computed аналитика (batch queries + recalcSnapshot в транзакции + каскад) | Принято rev 2 | R-11 | `decisions/ADR-011-analytics-precomputation.md` |
| 012 | Multi-tenancy: `organization_id` в WHERE + Prisma TenantExtension + per-org system_config + per-object config defer | Принято | §10.4 | `decisions/ADR-012-multitenancy.md` |
| 013 | PDF-отчёты: Puppeteer + Handlebars + BullMQ async + S3; ресурсные лимиты K8s | Принято | §10.4 | `decisions/ADR-013-pdf-reports.md` |
| 014 | Push-уведомления: FCM + `device_tokens` + NotificationService расширен; best-effort send | Принято | §10.4 | `decisions/ADR-014-push-notifications.md` |

### Правила работы с ADR

- Перед изменением кода в области, покрытой ADR, — прочитать соответствующий ADR.
- При обнаружении противоречия "код vs ADR" — приоритет у ADR; код приводится в соответствие.
- Новое архитектурное решение → новый ADR (не изменение существующего).
- Изменение принятого ADR — отдельным ADR со ссылкой "Заменяет ADR-NNN".

### Соответствие схеме БД

| ADR | Патч schema.sql |
|-----|-----------------|
| ADR-002 | (использует существующий `gen_random_uuid` через md5; новых полей не требует) |
| ADR-003 | **P-19** — `period_facts.version` + триггер; **P-23** — расширение триггера на `discrepancy_type`, `note`; `sync_queue.boq_version_number`, `is_syncing` |
| ADR-004 | **P-20** — таблица `mv_refresh_log` |
| ADR-005 | **P-24** — DELETE guard триггер на `sla_events` |
| ADR-006 | P-15 (уже применён) — `boq_items.work_lineage_id` + индекс; **P-22** — `boq_item_lineage_links` |
| ADR-007 | **P-25** — `REVOKE UPDATE,DELETE` + `fn_admin_correct_fact` (SECURITY DEFINER) |
| ADR-009 | **P-21** — `refresh_tokens` |
| ADR-010 | P-16 (уже применён) — `audit_log PARTITION BY RANGE` |
| ADR-012 | **P-26** — `organizations`; **P-27** — `users.organization_id`, `objects.organization_id`; **P-28** — `system_config.organization_id` + новый UNIQUE `(organization_id, key)`; **P-29** — `audit_log.organization_id` |
| ADR-013 | **P-30** — `periods.report_url`, `report_generated_at`, `report_generation_failed`; **P-31** — `objects.summary_report_url`, `summary_report_generated_at` |
| ADR-014 | **P-32** — `device_tokens(id, user_id, fcm_token, platform, device_id, registered_at, is_active)` |

---

## Сводная таблица компонентов

| Компонент | Тип | Статус | Таблицы БД |
|-----------|-----|--------|-----------|
| Тенанты | Multi-tenancy anchor | Схема готова (P-26..P-29) | `organizations` |
| Конфигурация L0 | Config store (per-org) | Схема готова (P-28) | `system_config` |
| Паспорт объекта | Master data | Схема готова (P-27) | `objects`, `object_participants` |
| BoQ Versioning | Document versioning | Схема готова | `boq_versions`, `boq_items` |
| 0-Report Engine | One-time workflow | Схема готова | `zero_reports`, `zero_report_items` |
| Period Engine | Recurring workflow | Схема готова | `periods`, `period_facts`, `photos` |
| Dispute & SLA Engine | Event-driven workflow | Схема готова | `discrepancies`, `sla_events` |
| Analytics Engine | Compute + snapshot | Схема готова | `readiness_snapshots`, `work_pace`, `mv_object_current_status` |
| Baseline Update | Approval workflow | Схема готова | `baseline_update_requests` |
| Offline Sync | Queue + conflict | Схема готова | `sync_queue` |
| Audit Log | Append-only, partitioned | Схема готова | `audit_log` (PARTITION BY RANGE, composite PK) |
| Auth Tokens | Refresh token storage | Схема готова | `refresh_tokens` |
| BoQ Lineage | Split/merge support | Схема готова | `boq_item_lineage_links` |
| Notifications | Delivery tracking | Схема готова | `notifications` |
| Push Notifications | FCM delivery | Схема готова (P-32) | `device_tokens` |
| ML / Forecast | Reserved (data collection only) | Схема готова | `ml_features`, `forecast_scenarios` |
| Backend API | Service layer | **Не начат** | — |
| Web App | React SPA | **Не начат** | — |
| Mobile App | React Native offline-first | **Не начат** | — |
| SLA Scheduler | Background worker (ROLE=worker) | **Не начат** | `sla_events` |
| PDF Reports | Async Puppeteer + S3 | **Не начат** (схема P-30..P-31) | — |

---

*Документ составлен на основе: `docs/concept_oks_v1_5.md` · `docs/algorithm_v1_3.md` · `backend/database/schema.sql` · `Claude.md`*
*Помечено «[Предположение]» — выводы, сделанные по аналогии с индустриальными практиками при отсутствии явных данных в документации.*
