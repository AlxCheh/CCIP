# Module Manifest

## 1. Module Overview

### Module Name

`sync`

### Purpose

Обеспечивает надёжную синхронизацию данных между мобильным приложением и сервером в offline-first режиме.

Определяет:

* bounded context обработки sync-очереди и разрешения конфликтов;
* за гарантированную доставку offline-операций без потери данных;
* данные: `sync_queue`.

---

### Main Principle

> Все изменения, выполненные offline, должны быть синхронизированы без потери данных и без недетерминированных конфликтов.

---

## 2. Core Responsibilities

Модуль отвечает за:

1. Приём очереди offline-операций с мобильного устройства
2. Валидацию и применение операций на сервере
3. Проверку конфликтов по версии записи (optimistic locking)
4. Возврат конфликтных состояний клиенту
5. Подтверждение успешно применённых операций
6. Идемпотентную повторную обработку при сбоях
7. Ручное разрешение конфликтов через SC-интерфейс

---

### Responsibility Boundary

Модуль **не отвечает** за:

1. Локальное хранение данных на устройстве (WatermelonDB — зона mobile)
2. Управление переходами состояний периода
3. Расчёт аналитики

---

### Rule

> Любая логика вне зоны ответственности должна обрабатываться другим bounded context.

---

## 3. Primary Architecture File

Основной архитектурный документ:

`docs/architecture/sync-engine.md`

Использовать для:

* анализа offline-first workflow и FIFO-очереди;
* изменения логики конфликт-детекции;
* анализа правил идемпотентности операций.

---

## 4. Related ADR Files

Подключать ADR только при изменении архитектурного поведения.

### Primary ADRs

* `ADR-003-offline-conflict-resolution.md` — стратегия разрешения конфликтов (version-based, не LWW)
* `ADR-008-watermelondb-offline.md` — интеграция WatermelonDB и серверной синхронизации

---

### Rule

> Если задача не меняет архитектурное решение — ADR не читать.

---

## 5. Related Error Sections

Ошибки модуля:

`docs/errors_log.md → Sync Engine section`

Использовать для:

* поиска известных проблем с конфликтами версий;
* проверки нарушений идемпотентности;
* анализа проблем очередности операций.

---

### Rule

> Читать только секцию ошибок данного модуля.

---

## 6. Delivery Dependencies

Связанные delivery документы:

* `docs/delivery/phase-4-7-backend-modules.md`

Использовать только при:

* планировании задач по sync API;
* декомпозиции реализации offline workflow.

---

### Rule

> Delivery документы не определяют архитектурные правила.

---

## 7. Upstream Dependencies

Модули, от которых зависит данный bounded context:

1. `common/guards` (Auth & Security) — аутентификация sync-операций, привязка к `userId`
2. `period` — проверка допустимости изменений (период должен быть в нужном статусе)
3. Data Layer — проверка версий записей и применение операций транзакционно

---

### Dependency Rule

> Разрешено читать только явно указанные upstream зависимости.

---

## 8. Downstream Dependencies

Модули, зависящие от данного bounded context:

1. Mobile (`apps/mobile`) — получает статусы операций и конфликтные данные

---

### Dependency Rule

> Изменение контракта требует проверки downstream модулей.

---

## 9. Read Sequence

При работе с модулем читать в следующем порядке:

### Level 1 — Manifest

Читать:
`sync.manifest.md`

Для:

* определения контекста;
* определения зависимостей и маршрута чтения.

---

### Level 2 — Architecture

Читать:
`docs/architecture/sync-engine.md`

Для:

* анализа offline-first workflow;
* изменения логики конфликт-детекции и очереди.

---

### Level 3 — ADR

Читать:
`ADR-003` при изменении стратегии разрешения конфликтов;
`ADR-008` при изменении интеграции с WatermelonDB.

---

### Level 4 — Errors

Читать:
только секцию `Sync Engine` в `docs/errors_log.md`.

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

* реализации обработки очереди и конфликт-детекции.

---

### CL3 — Manifest + Architecture + Single ADR

Для:

* изменения стратегии conflict resolution;
* изменения интеграционного контракта с WatermelonDB.

---

### CL4 — Cross-module

Для:

* изменения контракта с `period` (допустимость операций);
* изменения формата ответа для mobile.

---

### Rule

> Использовать минимальный context load level.

---

## 11. Change Escalation Rules

Если изменение затрагивает:

### Internal Logic

Изменять только:

* `docs/architecture/sync-engine.md`

---

### Architecture Rule

Изменять:

* `docs/architecture/sync-engine.md`
* связанный ADR (`ADR-003` или `ADR-008`)

---

### Cross-module Contract

Изменять:

* `docs/architecture/sync-engine.md`
* ADR
* manifests зависимых модулей (`period.manifest.md` если меняется контракт допустимости)

---

### Rule

> Изменения должны эскалироваться только до необходимого уровня.

---

## 12. Agent Routing Instruction

При запросе на изменение:

1. открыть `sync.manifest.md`;
2. определить тип изменения (очередь / конфликт / идемпотентность / photo upload);
3. подключить только необходимые документы;
4. не загружать нерелевантные модули.

---

### Forbidden

Запрещено:

* применять last-write-wins стратегию;
* читать `period-engine.md` без необходимости;
* дублировать применение одной операции;
* загружать все ADR вместо конкретного.

---

## 13. Main Principle

> Module manifest определяет минимальный маршрут чтения bounded context и запрещает загрузку лишнего контекста.
