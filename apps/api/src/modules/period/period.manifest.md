# Module Manifest

## 1. Module Overview

### Module Name

`period`

### Purpose

Управляет жизненным циклом отчётного периода строительного объекта.

Определяет:

* бизнес-цикл от открытия до закрытия периода;
* bounded context управления статусами `Period` и `PeriodFact`;
* данные: `periods`, `period_facts`, `readiness_snapshots`.

---

### Main Principle

> Период может переходить в следующее состояние только при соблюдении всех инвариантов текущего состояния.

---

## 2. Core Responsibilities

Модуль отвечает за:

1. Создание нового отчётного периода
2. Управление статусами периода (`open → gp_submitted → verification → closed / force_closed`)
3. Приём данных генерального подрядчика (GP submission)
4. Приём фактов стройконтроля (SC facts)
5. Проверку допустимости закрытия (нет открытых disputes)
6. Запуск snapshot-расчётов при закрытии
7. Блокировку некорректных переходов состояний

---

### Responsibility Boundary

Модуль **не отвечает** за:

1. Расчёт аналитических показателей и прогнозов
2. Разрешение disputes и SLA эскалации
3. Синхронизацию данных с мобильным приложением

---

### Rule

> Любая логика вне зоны ответственности должна обрабатываться другим bounded context.

---

## 3. Primary Architecture File

Основной архитектурный документ:

`docs/architecture/period-engine.md`

Использовать для:

* анализа state machine периода;
* изменений workflow (open / GP submit / verification / close);
* анализа инвариантов и ограничений.

---

## 4. Related ADR Files

Подключать ADR только при изменении архитектурного поведения.

### Primary ADRs

* `ADR-002-period-concurrency.md` — advisory lock при открытии периода
* `ADR-007-period-immutability.md` — immutability закрытых данных
* `ADR-005-sla-scheduler-reliability.md` — надёжность SLA-планировщика
* `ADR-009-rbac-gp-token.md` — токен подачи данных ГП

---

### Rule

> Если задача не меняет архитектурное решение — ADR не читать.

---

## 5. Related Error Sections

Ошибки модуля:

`docs/errors_log.md → Period Engine section`

Использовать для:

* поиска известных проблем с состояниями периода;
* проверки ошибок advisory lock и concurrency;
* анализа нарушений инвариантов.

---

### Rule

> Читать только секцию ошибок данного модуля.

---

## 6. Delivery Dependencies

Связанные delivery документы:

* `docs/delivery/phase-1-3-foundation-backend.md`
* `docs/delivery/phase-4-7-backend-modules.md`

Использовать только при:

* планировании задач по модулю;
* декомпозиции реализации workflow.

---

### Rule

> Delivery документы не определяют архитектурные правила.

---

## 7. Upstream Dependencies

Модули, от которых зависит данный bounded context:

1. `zero-report` — approved zero-report обязателен для открытия периода
2. `common/guards` (Auth & Security) — RBAC проверка ролей `sc`, `admin`, `director`

---

### Dependency Rule

> Разрешено читать только явно указанные upstream зависимости.

---

## 8. Downstream Dependencies

Модули, зависящие от данного bounded context:

1. `dispute` — блокирует / разблокирует закрытие периода через открытые disputes
2. `analytics` — получает триггер закрытия периода для запуска расчётов

---

### Dependency Rule

> Изменение контракта требует проверки downstream модулей.

---

## 9. Read Sequence

При работе с модулем читать в следующем порядке:

### Level 1 — Manifest

Читать:
`period.manifest.md`

Для:

* определения контекста и зависимостей;
* определения маршрута чтения.

---

### Level 2 — Architecture

Читать:
`docs/architecture/period-engine.md`

Для:

* анализа state machine;
* изменения поведения workflow.

---

### Level 3 — ADR

Читать:
связанный ADR только при изменении архитектурного решения (concurrency, immutability, SLA, GP token).

---

### Level 4 — Errors

Читать:
только секцию `Period Engine` в `docs/errors_log.md`.

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

* реализации логики переходов состояний;
* изменения workflow внутри bounded context.

---

### CL3 — Manifest + Architecture + Single ADR

Для:

* изменения concurrency-стратегии;
* изменения правил immutability или GP token.

---

### CL4 — Cross-module

Для:

* изменения контракта с `dispute` или `analytics`.

---

### Rule

> Использовать минимальный context load level.

---

## 11. Change Escalation Rules

Если изменение затрагивает:

### Internal Logic

Изменять только:

* `docs/architecture/period-engine.md`

---

### Architecture Rule

Изменять:

* `docs/architecture/period-engine.md`
* связанный ADR

---

### Cross-module Contract

Изменять:

* `docs/architecture/period-engine.md`
* ADR
* manifests downstream модулей (`dispute.manifest.md`, `analytics.manifest.md`)

---

### Rule

> Изменения должны эскалироваться только до необходимого уровня.

---

## 12. Agent Routing Instruction

При запросе на изменение:

1. открыть `period.manifest.md`;
2. определить тип изменения;
3. подключить только необходимые документы;
4. не загружать нерелевантные модули.

---

### Forbidden

Запрещено:

* читать все ADR модуля;
* читать весь `errors_log.md`;
* загружать `analytics-engine.md` или `disputes-sla.md` без необходимости;
* читать delivery plan вместо phase file.

---

## 13. Main Principle

> Module manifest определяет минимальный маршрут чтения bounded context и запрещает загрузку лишнего контекста.
