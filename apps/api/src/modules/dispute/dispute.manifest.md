# Module Manifest

## 1. Module Overview

### Module Name

`dispute`

### Purpose

Управляет жизненным циклом расхождений между данными участников, SLA дедлайнами и автоматическими эскалациями.

Определяет:

* bounded context обработки disputes и SLA-автоматики;
* за классификацию, эскалацию и force close расхождений;
* данные: `discrepancies`, `sla_events`.

---

### Main Principle

> Любое расхождение должно иметь фиксированный статус, SLA дедлайн и предсказуемый сценарий эскалации.

---

## 2. Core Responsibilities

Модуль отвечает за:

1. Создание disputes при обнаружении расхождений данных
2. Классификацию расхождений (Type 1 / Type 2)
3. Отслеживание SLA дедлайнов по сценариям A и B
4. Запуск эскалаций при нарушении SLA
5. Уведомление участников о событиях dispute
6. Force close по исчерпании SLA сценария
7. Фиксацию resolution и итогового значения

---

### Responsibility Boundary

Модуль **не отвечает** за:

1. Управление переходами состояний периода
2. Расчёт аналитических показателей
3. Синхронизацию данных с мобильным приложением

---

### Rule

> Любая логика вне зоны ответственности должна обрабатываться другим bounded context.

---

## 3. Primary Architecture File

Основной архитектурный документ:

`docs/architecture/disputes-sla.md`

Использовать для:

* анализа lifecycle dispute (`open → in_review → escalated → resolved / force_closed`);
* изменения SLA сценариев и сроков;
* анализа правил идемпотентности escalation events.

---

## 4. Related ADR Files

Подключать ADR только при изменении архитектурного поведения.

### Primary ADRs

* `ADR-005-sla-scheduler-reliability.md` — надёжность и идемпотентность SLA worker

---

### Rule

> Если задача не меняет архитектурное решение — ADR не читать.

---

## 5. Related Error Sections

Ошибки модуля:

`docs/errors_log.md → Disputes & SLA section`

Использовать для:

* поиска известных проблем с SLA таймингом;
* проверки дублирования escalation events;
* анализа нарушений идемпотентности.

---

### Rule

> Читать только секцию ошибок данного модуля.

---

## 6. Delivery Dependencies

Связанные delivery документы:

* `docs/delivery/phase-4-7-backend-modules.md`

Использовать только при:

* планировании задач по disputes и SLA worker;
* декомпозиции реализации escalation pipeline.

---

### Rule

> Delivery документы не определяют архитектурные правила.

---

## 7. Upstream Dependencies

Модули, от которых зависит данный bounded context:

1. `period` — источник `PeriodFact` для сравнения; блокировка закрытия при наличии открытых disputes
2. `common/guards` (Auth & Security) — определение ответственных ролей по SLA сценарию

---

### Dependency Rule

> Разрешено читать только явно указанные upstream зависимости.

---

## 8. Downstream Dependencies

Модули, зависящие от данного bounded context:

1. `period` — разблокировка закрытия после resolving всех disputes

---

### Dependency Rule

> Изменение контракта требует проверки downstream модулей.

---

## 9. Read Sequence

При работе с модулем читать в следующем порядке:

### Level 1 — Manifest

Читать:
`dispute.manifest.md`

Для:

* определения контекста;
* определения зависимостей и маршрута чтения.

---

### Level 2 — Architecture

Читать:
`docs/architecture/disputes-sla.md`

Для:

* анализа lifecycle и SLA сценариев;
* изменения логики эскалации.

---

### Level 3 — ADR

Читать:
`ADR-005` при изменении надёжности или идемпотентности SLA worker.

---

### Level 4 — Errors

Читать:
только секцию `Disputes & SLA` в `docs/errors_log.md`.

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

* реализации lifecycle и SLA логики внутри bounded context.

---

### CL3 — Manifest + Architecture + Single ADR

Для:

* изменения стратегии надёжности SLA scheduler;
* изменения правил идемпотентности.

---

### CL4 — Cross-module

Для:

* изменения контракта блокировки закрытия периода.

---

### Rule

> Использовать минимальный context load level.

---

## 11. Change Escalation Rules

Если изменение затрагивает:

### Internal Logic

Изменять только:

* `docs/architecture/disputes-sla.md`

---

### Architecture Rule

Изменять:

* `docs/architecture/disputes-sla.md`
* `ADR-005-sla-scheduler-reliability.md`

---

### Cross-module Contract

Изменять:

* `docs/architecture/disputes-sla.md`
* ADR
* `period.manifest.md` (контракт блокировки закрытия)

---

### Rule

> Изменения должны эскалироваться только до необходимого уровня.

---

## 12. Agent Routing Instruction

При запросе на изменение:

1. открыть `dispute.manifest.md`;
2. определить тип изменения (lifecycle / SLA timing / escalation / force close);
3. подключить только необходимые документы;
4. не загружать нерелевантные модули.

---

### Forbidden

Запрещено:

* запускать escalation дважды для одного события;
* читать `period-engine.md` без необходимости;
* загружать все ADR вместо конкретного;
* применять force close без прохождения полного SLA сценария.

---

## 13. Main Principle

> Module manifest определяет минимальный маршрут чтения bounded context и запрещает загрузку лишнего контекста.
