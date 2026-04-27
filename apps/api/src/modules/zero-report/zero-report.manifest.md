# Module Manifest

## 1. Module Overview

### Module Name

`zero-report`

### Purpose

Управляет нулевым отчётом — стартовой верификацией фактических объёмов выполненных работ на момент подключения объекта к системе.

Определяет:

* bounded context подготовки и утверждения Zero Report;
* за кросс-верификацию начальных объёмов по трём источникам;
* данные: `zero_reports`, `zero_report_items`.

---

### Main Principle

> Zero Report должен быть утверждён (`approved`) до открытия первого отчётного периода объекта.

---

## 2. Core Responsibilities

Модуль отвечает за:

1. Создание черновика Zero Report для объекта
2. Сбор начальных объёмов по каждому виду работ (`ZeroReportItem`)
3. Кросс-верификацию данных из трёх источников (полевые замеры, исполнительная документация, КС-2)
4. Подачу Zero Report на утверждение директором
5. Утверждение / отклонение Zero Report
6. Привязку к активной версии BoQ (`BoqVersion`)

---

### Responsibility Boundary

Модуль **не отвечает** за:

1. Управление версиями BoQ — зона `baseline`
2. Открытие и управление отчётными периодами
3. Расчёт аналитических показателей

---

### Rule

> Любая логика вне зоны ответственности должна обрабатываться другим bounded context.

---

## 3. Primary Architecture File

Основной архитектурный документ:

`docs/architecture/period-engine.md` → раздел 5.1 (Open Period: предусловие zero-report)

Использовать для:

* анализа роли Zero Report как предусловия открытия периода;
* анализа инварианта `zeroReport.status = 'approved'`.

---

## 4. Related ADR Files

Подключать ADR только при изменении архитектурного поведения.

### Primary ADRs

* `ADR-007-period-immutability.md` — immutability утверждённых данных Zero Report

---

### Rule

> Если задача не меняет архитектурное решение — ADR не читать.

---

## 5. Related Error Sections

Ошибки модуля:

`docs/errors_log.md → Zero Report section`

Использовать для:

* поиска известных проблем с кросс-верификацией;
* проверки ошибок статусных переходов;
* анализа нарушений привязки к BoQ версии.

---

### Rule

> Читать только секцию ошибок данного модуля.

---

## 6. Delivery Dependencies

Связанные delivery документы:

* `docs/delivery/phase-1-3-foundation-backend.md`

Использовать только при:

* планировании задач по Zero Report workflow;
* декомпозиции реализации верификации источников.

---

### Rule

> Delivery документы не определяют архитектурные правила.

---

## 7. Upstream Dependencies

Модули, от которых зависит данный bounded context:

1. `baseline` — активная версия BoQ (`BoqVersion.isActive = true`) как источник плановых объёмов
2. `common/guards` (Auth & Security) — RBAC: SC подаёт, директор утверждает

---

### Dependency Rule

> Разрешено читать только явно указанные upstream зависимости.

---

## 8. Downstream Dependencies

Модули, зависящие от данного bounded context:

1. `period` — проверяет `ZeroReport.status = 'approved'` как обязательное предусловие открытия периода

---

### Dependency Rule

> Изменение контракта требует проверки downstream модулей.

---

## 9. Read Sequence

При работе с модулем читать в следующем порядке:

### Level 1 — Manifest

Читать:
`zero-report.manifest.md`

Для:

* определения контекста;
* определения зависимостей и маршрута чтения.

---

### Level 2 — Architecture

Читать:
`docs/architecture/period-engine.md` → раздел 5.1

Для:

* анализа инварианта предусловия;
* изменения условий approved-статуса.

---

### Level 3 — ADR

Читать:
`ADR-007` при изменении правил immutability утверждённых данных.

---

### Level 4 — Errors

Читать:
только секцию `Zero Report` в `docs/errors_log.md`.

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

* реализации workflow создания и утверждения Zero Report.

---

### CL3 — Manifest + Architecture + Single ADR

Для:

* изменения правил immutability утверждённых данных.

---

### CL4 — Cross-module

Для:

* изменения контракта предусловия с `period`;
* изменения зависимости от активной версии BoQ (`baseline`).

---

### Rule

> Использовать минимальный context load level.

---

## 11. Change Escalation Rules

Если изменение затрагивает:

### Internal Logic

Изменять только:

* раздел 5.1 `docs/architecture/period-engine.md`

---

### Architecture Rule

Изменять:

* `docs/architecture/period-engine.md`
* `ADR-007-period-immutability.md`

---

### Cross-module Contract

Изменять:

* `docs/architecture/period-engine.md`
* ADR
* `period.manifest.md` (контракт предусловия открытия)

---

### Rule

> Изменения должны эскалироваться только до необходимого уровня.

---

## 12. Agent Routing Instruction

При запросе на изменение:

1. открыть `zero-report.manifest.md`;
2. определить тип изменения (workflow / верификация / approved-контракт);
3. подключить только необходимые документы;
4. не загружать нерелевантные модули.

---

### Forbidden

Запрещено:

* открывать период без approved Zero Report;
* изменять утверждённые данные Zero Report;
* читать весь `period-engine.md` при задаче только по Zero Report;
* загружать все ADR вместо конкретного.

---

## 13. Main Principle

> Module manifest определяет минимальный маршрут чтения bounded context и запрещает загрузку лишнего контекста.
