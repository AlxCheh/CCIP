# Module Manifest

## 1. Module Overview

### Module Name

`analytics`

### Purpose

Рассчитывает аналитические показатели строительного объекта на основе закрытых периодов.

Определяет:

* bounded context расчётов готовности, темпа и прогнозов;
* за формирование `ReadinessSnapshot` и обновление Materialized Views;
* данные: `readiness_snapshots`, `work_pace`, `forecast_scenarios`, `mv_refresh_log`.

---

### Main Principle

> Все аналитические показатели должны вычисляться детерминированно, транзакционно и только на подтверждённых данных закрытых периодов.

---

## 2. Core Responsibilities

Модуль отвечает за:

1. Расчёт готовности по каждому виду работ (`work readiness = min(fact / plan, 100%)`)
2. Расчёт сводной готовности объекта (`object readiness = Σ(work readiness × weight)`)
3. Формирование `ReadinessSnapshot` при закрытии периода
4. Расчёт темпа выполнения работ (`WorkPace`) по историческим данным
5. Прогнозирование даты завершения строительства
6. Обновление Materialized Views для dashboard

---

### Responsibility Boundary

Модуль **не отвечает** за:

1. Управление переходами состояний периода
2. Разрешение disputes и SLA эскалации
3. Синхронизацию данных с мобильным приложением
4. Live-расчёты в runtime dashboard (запрещено)

---

### Rule

> Любая логика вне зоны ответственности должна обрабатываться другим bounded context.

---

## 3. Primary Architecture File

Основной архитектурный документ:

`docs/architecture/analytics-engine.md`

Использовать для:

* анализа формул расчёта готовности и прогнозов;
* изменения workflow расчётов;
* анализа правил Materialized View staleness.

---

## 4. Related ADR Files

Подключать ADR только при изменении архитектурного поведения.

### Primary ADRs

* `ADR-004-materialized-view-staleness.md` — политика допустимой устарелости MV
* `ADR-011-analytics-precomputation.md` — стратегия предварительного расчёта аналитики

---

### Rule

> Если задача не меняет архитектурное решение — ADR не читать.

---

## 5. Related Error Sections

Ошибки модуля:

`docs/errors_log.md → Analytics Engine section`

Использовать для:

* поиска известных проблем с расчётами готовности;
* проверки ошибок MV refresh;
* анализа нарушений детерминированности.

---

### Rule

> Читать только секцию ошибок данного модуля.

---

## 6. Delivery Dependencies

Связанные delivery документы:

* `docs/delivery/phase-4-7-backend-modules.md`

Использовать только при:

* планировании задач по расчётам и snapshots;
* декомпозиции реализации analytics pipeline.

---

### Rule

> Delivery документы не определяют архитектурные правила.

---

## 7. Upstream Dependencies

Модули, от которых зависит данный bounded context:

1. `period` — источник закрытых периодов и `PeriodFact`; триггер запуска расчётов
2. Data Layer — источник планового объёма (`BoqItem.planVolume`) и весовых коэффициентов

---

### Dependency Rule

> Разрешено читать только явно указанные upstream зависимости.

---

## 8. Downstream Dependencies

Модули, зависящие от данного bounded context:

1. Frontend dashboard — читает только агрегаты из MV, не выполняет расчёты

---

### Dependency Rule

> Изменение контракта требует проверки downstream модулей.

---

## 9. Read Sequence

При работе с модулем читать в следующем порядке:

### Level 1 — Manifest

Читать:
`analytics.manifest.md`

Для:

* определения контекста;
* определения зависимостей и маршрута чтения.

---

### Level 2 — Architecture

Читать:
`docs/architecture/analytics-engine.md`

Для:

* анализа формул расчёта;
* изменения аналитического pipeline.

---

### Level 3 — ADR

Читать:
`ADR-004` при изменении политики MV staleness;
`ADR-011` при изменении стратегии precomputation.

---

### Level 4 — Errors

Читать:
только секцию `Analytics Engine` в `docs/errors_log.md`.

---

### Main Rule

> Читать следующий уровень только если предыдущий не даёт достаточного контекста.

---

## 10. Context Load Limits

### CL1 — Manifest Only

Для:

* навигации и маршрутизации.

---

### CL2 — Manifest + Architecture

Для:

* реализации расчётов внутри bounded context;
* изменения формул readiness / pace / forecast.

---

### CL3 — Manifest + Architecture + Single ADR

Для:

* изменения политики MV staleness;
* изменения стратегии precomputation.

---

### CL4 — Cross-module

Для:

* изменения контракта с `period` (триггер закрытия);
* изменения формата данных для dashboard.

---

### Rule

> Использовать минимальный context load level.

---

## 11. Change Escalation Rules

Если изменение затрагивает:

### Internal Logic

Изменять только:

* `docs/architecture/analytics-engine.md`

---

### Architecture Rule

Изменять:

* `docs/architecture/analytics-engine.md`
* связанный ADR (`ADR-004` или `ADR-011`)

---

### Cross-module Contract

Изменять:

* `docs/architecture/analytics-engine.md`
* ADR
* `period.manifest.md` (если меняется триггер закрытия)

---

### Rule

> Изменения должны эскалироваться только до необходимого уровня.

---

## 12. Agent Routing Instruction

При запросе на изменение:

1. открыть `analytics.manifest.md`;
2. определить тип изменения (расчёт / MV / прогноз);
3. подключить только необходимые документы;
4. не загружать нерелевантные модули.

---

### Forbidden

Запрещено:

* выполнять live-расчёты в runtime dashboard;
* читать `period-engine.md` без необходимости;
* загружать все ADR вместо конкретного;
* пересчитывать показатели на незакрытых периодах.

---

## 13. Main Principle

> Module manifest определяет минимальный маршрут чтения bounded context и запрещает загрузку лишнего контекста.
