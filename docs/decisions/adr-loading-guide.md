# ADR Index

Этот каталог содержит архитектурные решения (ADR), определяющие ключевые правила реализации платформы CCIP.

Цель индекса:

* маршрутизировать доступ к архитектурным решениям;
* минимизировать загрузку ADR-контекста;
* обеспечить чтение только релевантных решений;
* предотвратить чтение всех ADR без необходимости.

---

## 1. ADR Usage Principle

ADR используются только в случаях:

1. архитектурных изменений;
2. изменений границ модулей;
3. изменений инвариантов;
4. изменений интеграционных контрактов;
5. изменений транзакционных правил.

---

### Основное правило:

> Если задача не изменяет архитектурное решение — ADR не читать.

---

## 2. ADR Routing by Module

---

### Core Platform ADR

Использовать для:

* изменения границ модулей;
* изменения системных инвариантов;
* изменения взаимодействия bounded contexts.

Файлы:

* `ADR-001-modular-architecture.md`
* `ADR-002-domain-boundaries.md`
* `ADR-003-system-invariants.md`

---

### Auth & Security ADR

Использовать для:

* JWT архитектуры;
* RBAC правил;
* token security;
* tenant isolation.

Файлы:

* `ADR-010-jwt-access-refresh.md`
* `ADR-011-rbac-policy.md`
* `ADR-012-gp-token-security.md`
* `ADR-013-tenant-isolation.md`

---

### Period Engine ADR

Использовать для:

* lifecycle period;
* period transitions;
* close rules.

Файлы:

* `ADR-020-period-lifecycle.md`
* `ADR-021-period-transitions.md`
* `ADR-022-period-close-policy.md`

---

### Disputes & SLA ADR

Использовать для:

* dispute lifecycle;
* escalation rules;
* force close policy.

Файлы:

* `ADR-030-dispute-lifecycle.md`
* `ADR-031-sla-escalation.md`
* `ADR-032-force-close-policy.md`

---

### Analytics Engine ADR

Использовать для:

* snapshots;
* forecasting;
* materialized views.

Файлы:

* `ADR-040-snapshot-consistency.md`
* `ADR-041-forecasting-rules.md`
* `ADR-042-materialized-views.md`

---

### Sync Engine ADR

Использовать для:

* offline-first;
* conflict resolution;
* idempotent sync.

Файлы:

* `ADR-050-offline-first.md`
* `ADR-051-conflict-resolution.md`
* `ADR-052-idempotent-sync.md`

---

### Data Layer ADR

Использовать для:

* transaction boundaries;
* audit immutability;
* optimistic locking.

Файлы:

* `ADR-060-transaction-boundaries.md`
* `ADR-061-audit-immutability.md`
* `ADR-062-optimistic-locking.md`

---

## 3. ADR Loading Rules

При необходимости чтения ADR:

1. определить архитектурный модуль;
2. определить тип изменения;
3. загрузить только соответствующий ADR;
4. не загружать связанные ADR без необходимости.

---

### Запрещено:

* читать весь каталог ADR;
* читать несколько ADR “на всякий случай”;
* читать ADR до определения bounded context.

---

## 4. ADR Loading Levels

---

### D1 — No ADR

Использовать при:

* локальной реализации;
* изменении кода без изменения решений.

ADR не подключаются.

---

### D2 — Single ADR

Использовать при:

* изменении одного архитектурного правила.

Читать:

* один релевантный ADR.

---

### D3 — Module ADR Set

Использовать при:

* изменении архитектуры модуля.

Читать:

* несколько ADR в рамках одного bounded context.

---

### D4 — Cross-module ADR

Использовать только при:

* изменении границ модулей;
* изменении системных инвариантов.

---

### Основное правило:

> Использовать минимальный ADR уровень, достаточный для задачи.

---

## 5. ADR Change Rules

Изменение существующего ADR допускается только если:

1. меняется архитектурное решение;
2. создается новый ADR;
3. фиксируется причина изменения;
4. обновляются связанные ссылки.

---

### Запрещено:

* менять поведение системы без ADR;
* менять архитектурный контракт без фиксации решения.

---

## 6. ADR Priority Rules

При конфликте источников:

1. ADR имеет приоритет над module docs;
2. module docs имеет приоритет над delivery docs;
3. delivery docs не может менять архитектурное решение.

---

### Приоритет:

`ADR > architecture module > delivery plan`

---

## 7. ADR Routing Matrix

---

### Если задача касается:

#### security policy

читать:

* `ADR-011-rbac-policy.md`

---

#### JWT/session

читать:

* `ADR-010-jwt-access-refresh.md`

---

#### period transitions

читать:

* `ADR-021-period-transitions.md`

---

#### period closing

читать:

* `ADR-022-period-close-policy.md`

---

#### dispute escalation

читать:

* `ADR-031-sla-escalation.md`

---

#### force close

читать:

* `ADR-032-force-close-policy.md`

---

#### analytics snapshots

читать:

* `ADR-040-snapshot-consistency.md`

---

#### forecasting

читать:

* `ADR-041-forecasting-rules.md`

---

#### sync conflicts

читать:

* `ADR-051-conflict-resolution.md`

---

#### sync retries

читать:

* `ADR-052-idempotent-sync.md`

---

#### transaction rules

читать:

* `ADR-060-transaction-boundaries.md`

---

#### optimistic locking

читать:

* `ADR-062-optimistic-locking.md`

---

## 8. Read Policy

Порядок чтения:

1. сначала `docs/decisions/index.md`;
2. затем один релевантный ADR;
3. дополнительные ADR только при подтвержденной зависимости.

---

### Запрещено:

* читать все ADR подряд;
* читать unrelated ADR;
* подключать cross-module ADR без необходимости.

---

## 9. Main Principle

> Архитектурные решения должны подключаться точечно, только в рамках конкретного bounded context и только при изменении архитектурного поведения системы.
