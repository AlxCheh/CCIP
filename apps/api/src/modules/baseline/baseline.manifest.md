# Module Manifest

## 1. Module Overview

### Module Name

`baseline`

### Purpose

Управляет версионированием BoQ и запросами на изменение плановых объёмов работ.

Определяет:

* bounded context управления `BoqVersion` и `BaselineUpdateRequest`;
* за контролируемое изменение базового плана с обоснованием и привязкой к периоду;
* данные: `boq_versions`, `boq_items`, `boq_item_lineage_links`, `baseline_update_requests`.

---

### Main Principle

> Изменение базового плана допускается только через утверждённый запрос с обоснованием, вступающий в силу с явно указанного периода.

---

## 2. Core Responsibilities

Модуль отвечает за:

1. Управление версиями BoQ (`BoqVersion`) и их активацией
2. Хранение позиций BoQ (`BoqItem`) с плановыми объёмами и весовыми коэффициентами
3. Сопровождение lineage-связей при split/merge позиций (`BoqItemLineageLink`, ADR-006)
4. Создание запросов на изменение плановых объёмов (`BaselineUpdateRequest`)
5. Утверждение / отклонение запросов директором
6. Применение изменений начиная с указанного периода (`appliesFromPeriodId`)

---

### Responsibility Boundary

Модуль **не отвечает** за:

1. Управление переходами состояний периода
2. Расчёт аналитических показателей
3. Верификацию фактических объёмов (Zero Report — отдельный bounded context)

---

### Rule

> Любая логика вне зоны ответственности должна обрабатываться другим bounded context.

---

## 3. Primary Architecture File

Основной архитектурный документ:

`docs/architecture/data-layer.md`

Использовать для:

* анализа BoQ versioning и lineage-модели;
* изменения схемы хранения версий и позиций;
* анализа правил активации версии.

---

## 4. Related ADR Files

Подключать ADR только при изменении архитектурного поведения.

### Primary ADRs

* `ADR-006-boq-versioning.md` — стратегия версионирования BoQ, lineage-связи при split/merge

---

### Rule

> Если задача не меняет архитектурное решение — ADR не читать.

---

## 5. Related Error Sections

Ошибки модуля:

`docs/errors_log.md → Baseline section`

Использовать для:

* поиска известных проблем с версионированием BoQ;
* проверки ошибок lineage-связей;
* анализа нарушений при применении изменений.

---

### Rule

> Читать только секцию ошибок данного модуля.

---

## 6. Delivery Dependencies

Связанные delivery документы:

* `docs/delivery/phase-4-7-backend-modules.md`

Использовать только при:

* планировании задач по BoQ versioning и baseline requests;
* декомпозиции реализации lineage-модели.

---

### Rule

> Delivery документы не определяют архитектурные правила.

---

## 7. Upstream Dependencies

Модули, от которых зависит данный bounded context:

1. `common/guards` (Auth & Security) — SC создаёт запрос, директор утверждает
2. Data Layer — транзакционное применение изменений версии

---

### Dependency Rule

> Разрешено читать только явно указанные upstream зависимости.

---

## 8. Downstream Dependencies

Модули, зависящие от данного bounded context:

1. `zero-report` — использует активную `BoqVersion` как источник позиций
2. `period` — использует `boqVersionId` при создании периода
3. `analytics` — пересчёт показателей при изменении `planVolume` или `weightCoef`

---

### Dependency Rule

> Изменение контракта требует проверки downstream модулей.

---

## 9. Read Sequence

При работе с модулем читать в следующем порядке:

### Level 1 — Manifest

Читать:
`baseline.manifest.md`

Для:

* определения контекста;
* определения зависимостей и маршрута чтения.

---

### Level 2 — Architecture

Читать:
`docs/architecture/data-layer.md`

Для:

* анализа BoQ versioning и lineage-модели;
* изменения правил активации версии.

---

### Level 3 — ADR

Читать:
`ADR-006` при изменении стратегии версионирования или lineage-связей.

---

### Level 4 — Errors

Читать:
только секцию `Baseline` в `docs/errors_log.md`.

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

* реализации workflow baseline requests и активации версии.

---

### CL3 — Manifest + Architecture + Single ADR

Для:

* изменения стратегии версионирования BoQ;
* изменения lineage-модели split/merge.

---

### CL4 — Cross-module

Для:

* изменения контракта с `zero-report`, `period` или `analytics`.

---

### Rule

> Использовать минимальный context load level.

---

## 11. Change Escalation Rules

Если изменение затрагивает:

### Internal Logic

Изменять только:

* `docs/architecture/data-layer.md`

---

### Architecture Rule

Изменять:

* `docs/architecture/data-layer.md`
* `ADR-006-boq-versioning.md`

---

### Cross-module Contract

Изменять:

* `docs/architecture/data-layer.md`
* ADR
* manifests downstream модулей (`zero-report.manifest.md`, `period.manifest.md`, `analytics.manifest.md`)

---

### Rule

> Изменения должны эскалироваться только до необходимого уровня.

---

## 12. Agent Routing Instruction

При запросе на изменение:

1. открыть `baseline.manifest.md`;
2. определить тип изменения (версионирование / lineage / baseline request / активация);
3. подключить только необходимые документы;
4. не загружать нерелевантные модули.

---

### Forbidden

Запрещено:

* менять `planVolume` или `weightCoef` напрямую без `BaselineUpdateRequest`;
* активировать версию без утверждённого запроса;
* загружать весь `data-layer.md` при задаче только по baseline requests;
* загружать все ADR вместо конкретного.

---

## 13. Main Principle

> Module manifest определяет минимальный маршрут чтения bounded context и запрещает загрузку лишнего контекста.
