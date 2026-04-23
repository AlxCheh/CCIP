# CCIP — Архитектурный документ

**Construction Control & Intelligence Platform**
*На основе: Концепция v1.5 · Алгоритм v1.3 · Schema PostgreSQL 16 (P-01..P-18)*
*Дата составления: 2026-04-23*

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
| Фоновые процессы | **Event-driven** через очередь (SLA-таймеры через Redis/BullMQ или APScheduler) |

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
| Backend framework | NestJS (Node.js) **или** FastAPI (Python) | **Не принято** |
| Очереди / SLA | Redis + BullMQ **или** APScheduler | Зависит от backend |
| Файловое хранилище | S3-совместимое (MinIO / AWS S3) | Finalized |
| Auth | JWT + Refresh tokens + RBAC middleware | Finalized |

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
│  (BullMQ/APScheduler)│  (S3 / MinIO)         │  (Redis / SMTP)       │
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
- Закрытый период физически не изменяется — только маркировка через `audit_log`
- Конфликт офлайн-данных — `last-write-wins` запрещён, решение SC через UI

### 3.4 SLA Scheduler — архитектура событий

```
Тип 2 выставлен (day 0)
  → INSERT sla_events (scenario='A', event_type='notify_director_day3', scheduled_at=+3d)
  → INSERT sla_events (scenario='A', event_type='force_close_day5',     scheduled_at=+5d)

Scheduler (poll по idx_sla_events_scheduled):
  → day 3: NOTIFY director, executed_at=NOW()
  → day 5: SET work.status='forced_sc_figure', period.status='force_closed', executed_at=NOW()

Сценарий B (ГП ответил, SC не принял):
  → INSERT sla_events (scenario='B', event_type='director_deadline_day7',  scheduled_at=+7d)
  → INSERT sla_events (scenario='B', event_type='sc_figure_applied_day14', scheduled_at=+14d)
```

### 3.5 Внешний доступ ГП (stateless token)

ГП не имеет учётной записи в системе. Доступ к форме подачи шаблона:
- `periods.gp_submission_token` (UUID) генерируется при отправке шаблона
- `periods.gp_token_expires_at` — истекает после SLA-дедлайна
- Одноразовый: после `gp_submitted_at IS NOT NULL` повторная подача блокируется

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

**Операции доступные офлайн:** `submit_fact`, `upload_photo`, `add_discrepancy_note`, `open_period`
**Только онлайн:** `close_period`, `submit_gp_template`, `approve_zero_report`

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
  │
  └──► sync_queue (device_id, operation, payload JSONB, client_timestamp, status, conflict_data)
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

```sql
-- Пример: суммарный факт по виду работ через все версии BoQ
SELECT SUM(pf.accepted_volume)
FROM period_facts pf
JOIN boq_items bi ON bi.id = pf.boq_item_id
WHERE bi.work_lineage_id = :target_lineage_id;
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
| **BullMQ / APScheduler** | Redis protocol / internal | Внутренний | SLA-таймеры, периодический пересчёт, refresh materialized view |

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

```sql
-- Производительность: ежемесячные партиции
CREATE TABLE audit_log PARTITION BY RANGE (performed_at);
CREATE TABLE audit_log_2026_04 FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE audit_log_default PARTITION OF audit_log DEFAULT;
-- Создание партиций: DBA или pg_partman
```

### 7.3 Materialized View — стратегия обновления

`mv_object_current_status` обновляется после каждого закрытия периода:
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_object_current_status;
-- CONCURRENTLY: без блокировки чтения дашборда директора
```

### 7.4 Sync Queue — жизненный цикл записей

```
sync_queue.status:
  pending → applied (успешно применено)
  pending → conflict (конфликт с сервером)
  pending → rejected (период уже закрыт, admin отклонил)
  conflict → applied/rejected (SC разрешил вручную)

Архивация: записи со status IN ('applied', 'rejected') старше 30 дней
           удаляются scheduled job (не partition — записи short-lived)
```

---

## 8. Безопасность

### 8.1 Аутентификация

| Механизм | Применение |
|---------|-----------|
| JWT Access Token | Короткоживущий, передаётся в Authorization header |
| JWT Refresh Token | Долгоживущий, HTTP-only cookie, ротируется при обновлении |
| GP Submission Token | UUID в URL, одноразовый, истекает по SLA, не требует auth |

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
| **Неизменность истории** | `periods.status='closed'` → UPDATE запрещён на уровне приложения; только Admin с `audit_log` записью |
| **Append-only audit log** | `audit_log` — только INSERT; DELETE запрещён |
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

| # | Риск | Вероятность | Влияние | Mitigation |
|---|------|:-----------:|:-------:|-----------|
| **R-01** | **Backend framework не выбран** (NestJS vs FastAPI) | Высокая (сейчас) | Высокое | Требует решения до старта разработки; влияет на SLA-scheduler, ORM, тестирование |
| **R-02** | **Конкурентное открытие периодов** | Средняя | Высокое | `pg_advisory_lock(object_id)` при назначении `period_number`; UNIQUE (object_id, period_number) как fallback |
| **R-03** | **Офлайн-конфликты данных** на одной позиции двух SC | Средняя | Высокое | Запрет `last-write-wins`; UI конфликт-резолюции с обязательным примечанием SC |
| **R-04** | **Дрейф materialized view** (MV устарело при сбое refresh) | Средняя | Среднее | Retry refresh после закрытия периода; добавить `calculated_at` в `readiness_snapshots` для отображения staleness |
| **R-05** | **SLA Scheduler — single point of failure** | Средняя | Высокое | K8s: один реплика (нельзя >1 без distributed lock); Redis lock или job deduplication в BullMQ |

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
| **Версионная связность fact ↔ BoQ** | `period_facts.boq_item_id` ссылается на конкретную версию; при смене BoQ старые fact-записи остаются на старом `boq_item_id`. Кросс-версионный запрос требует JOIN через `work_lineage_id`. Триггер `trg_period_facts_version_check` предотвращает запись факта на не-активную версию. |
| **Каскадный пересчёт при CorrectZeroReport** | Случай B (>5% правки) требует ретроактивного маркирования всех закрытых периодов — потенциально долгая транзакция при большой истории. *[Предположение]* Рекомендуется выполнять в фоновой задаче с прогресс-баром. |
| **GP Token expiry race** | Если ГП подаёт шаблон в момент истечения токена — нужна grace period (≥1 минута). Не описано явно в концепции. |
| **Конфликт смены ГП mid-dispute** | Блокировка при наличии `'Оспорено'` покрывает это; но уведомление нового ГП о pre-existing спорах требует явной процедуры (не описана). |

### 10.4 Архитектурные пробелы (требуют решений)

| Пробел | Рекомендация |
|--------|-------------|
| PDF-генерация отчётов | Определить движок (Puppeteer/WeasyPrint) и шаблоны; хранить в S3 |
| Push-уведомления для Mobile | `notifications` таблица есть; нужен push-провайдер (FCM/APNs) |
| ML-модули | `ml_features` таблица зарезервирована; pipeline обучения не описан |
| Multi-tenancy | Отдельные БД на клиента vs. одна БД с `tenant_id` — не определено |
| Rate limiting для GP token endpoint | Защита от перебора UUID токенов |
| `system_config` per-object overrides | Сейчас конфиг глобальный; при нескольких ОКС на аккаунте нужен `object_config` |

---

## Сводная таблица компонентов

| Компонент | Тип | Статус | Таблицы БД |
|-----------|-----|--------|-----------|
| Конфигурация L0 | Config store | Схема готова | `system_config` |
| Паспорт объекта | Master data | Схема готова | `objects`, `object_participants` |
| BoQ Versioning | Document versioning | Схема готова | `boq_versions`, `boq_items` |
| 0-Report Engine | One-time workflow | Схема готова | `zero_reports`, `zero_report_items` |
| Period Engine | Recurring workflow | Схема готова | `periods`, `period_facts`, `photos` |
| Dispute & SLA Engine | Event-driven workflow | Схема готова | `discrepancies`, `sla_events` |
| Analytics Engine | Compute + snapshot | Схема готова | `readiness_snapshots`, `work_pace`, `mv_object_current_status` |
| Baseline Update | Approval workflow | Схема готова | `baseline_update_requests` |
| Offline Sync | Queue + conflict | Схема готова | `sync_queue` |
| Audit Log | Append-only, partitioned | Схема готова | `audit_log` (PARTITION BY RANGE) |
| Notifications | Delivery tracking | Схема готова | `notifications` |
| ML / Forecast | Reserved | Схема готова | `ml_features`, `forecast_scenarios` |
| Backend API | Service layer | **Не начат** | — |
| Web App | React SPA | **Не начат** | — |
| Mobile App | React Native offline-first | **Не начат** | — |
| SLA Scheduler | Background worker | **Не начат** | `sla_events` (polling) |
| PDF Reports | Report generation | **Не начат** | — |

---

*Документ составлен на основе: `docs/concept_oks_v1_5.md` · `docs/algorithm_v1_3.md` · `backend/database/schema.sql` · `Claude.md`*
*Помечено «[Предположение]» — выводы, сделанные по аналогии с индустриальными практиками при отсутствии явных данных в документации.*
