# Architecture Index

Этот каталог содержит модульную архитектуру платформы CCIP.

Цель декомпозиции:

- уменьшить объем загружаемого контекста;
    
- исключить чтение полного архитектурного документа;
    
- обеспечить маршрутизацию по архитектурным областям;
    
- ускорить работу проектных агентов.
    

---

## Architecture Modules

### 1. Core Platform

Файл: `docs/architecture/core-platform.md`

Назначение:

- общие принципы платформы;
    
- границы архитектурных модулей;
    
- ключевые доменные сущности.
    

Использовать для:

- high-level архитектурных решений;
    
- анализа границ модулей.
    

---

### 2. Auth & Security

Файл: `docs/architecture/auth-security.md`

Назначение:

- аутентификация;
    
- авторизация;
    
- RBAC;
    
- security flow.
    

Использовать для:

- JWT;
    
- guards;
    
- permissions;
    
- security policies.
    

---

### 3. Object Lifecycle

Файл: `docs/architecture/object-lifecycle.md`

Назначение:

- жизненный цикл объекта;
    
- создание объекта;
    
- zero-report;
    
- участники проекта.
    

Использовать для:

- инициализации объекта;
    
- управления участниками;
    
- стартовых сценариев.
    

---

### 4. Period Engine

Файл: `docs/architecture/period-engine.md`

Назначение:

- цикл отчетного периода;
    
- состояния периода;
    
- открытие и закрытие периода;
    
- контроль инвариантов.
    

Использовать для:

- period workflow;
    
- period state transitions;
    
- close/open logic.
    

---

### 5. Disputes & SLA

Файл: `docs/architecture/disputes-sla.md`

Назначение:

- управление расхождениями;
    
- SLA события;
    
- эскалации;
    
- автоматические сценарии.
    

Использовать для:

- dispute handling;
    
- SLA automation;
    
- escalation flows.
    

---

### 6. Analytics Engine

Файл: `docs/architecture/analytics-engine.md`

Назначение:

- расчеты готовности;
    
- snapshots;
    
- прогнозирование;
    
- аналитические модели.
    

Использовать для:

- readiness calculations;
    
- forecasting;
    
- materialized views.
    

---

### 7. Sync Engine

Файл: `docs/architecture/sync-engine.md`

Назначение:

- offline synchronization;
    
- conflict resolution;
    
- sync orchestration.
    

Использовать для:

- mobile sync;
    
- conflict management;
    
- offline-first scenarios.
    

---

### 8. Web Frontend

Файл: `docs/architecture/web-frontend.md`

Назначение:

- web-модули;
    
- dashboard;
    
- пользовательские сценарии.
    

Использовать для:

- web routing;
    
- dashboard logic;
    
- frontend workflows.
    

---

### 9. Mobile Architecture

Файл: `docs/architecture/mobile-architecture.md`

Назначение:

- mobile workflows;
    
- local storage;
    
- sync integration.
    

Использовать для:

- mobile logic;
    
- offline behavior;
    
- mobile sync.
    

---

### 10. Infrastructure

Файл: `docs/architecture/infrastructure.md`

Назначение:

- инфраструктура платформы;
    
- deployment;
    
- observability.
    

Использовать для:

- Docker;
    
- Kubernetes;
    
- monitoring;
    
- backups.
    

---

### 11. Data Layer

Файл: `docs/architecture/data-layer.md`

Назначение:

- data access;
    
- transactions;
    
- immutability;
    
- audit.
    

Использовать для:

- database rules;
    
- transaction boundaries;
    
- audit log logic.
    

---

### 12. Integrations

Файл: `docs/architecture/integrations.md`

Назначение:

- внешние интеграции;
    
- notifications;
    
- storage adapters.
    

Использовать для:

- email;
    
- S3;
    
- external integrations.
    

---

### 13. Cross-cutting Concerns

Файл: `docs/architecture/cross-cutting.md`

Назначение:

- логирование;
    
- конфигурация;
    
- обработка ошибок;
    
- сквозные механизмы.
    

Использовать для:

- logging;
    
- config;
    
- error handling;
    
- shared concerns.
    

---

## Context Loading Rules

1. Сначала использовать только `index.md`.
    
2. Загружать только один релевантный модуль.
    
3. Подключать ADR только при необходимости.
    
4. Не читать несколько архитектурных модулей без необходимости.
    
5. Полная архитектурная загрузка допускается только для cross-module задач.
    

---

## Architecture Loading Levels

### A1 — Routing Context

Использовать только `index.md`

Для выбора архитектурного модуля.

---

### A2 — Module Context

Использовать один модульный файл.

Для реализации задачи в рамках одной области.

---

### A3 — Module + ADR

Использовать модуль + соответствующий ADR.

Для архитектурно-зависимых изменений.

---

### A4 — Cross-module Context

Использовать несколько модулей только если задача затрагивает несколько bounded contexts.

---

## Main Rule

> Загружать минимально необходимый архитектурный контекст для выполнения задачи.