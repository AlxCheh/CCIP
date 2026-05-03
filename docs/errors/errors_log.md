# Errors Log

Этот файл содержит журнал ошибок, известных проблем и архитектурных расхождений платформы CCIP.

Цель журнала:

* фиксировать ошибки по bounded contexts;
* обеспечивать быстрый поиск известных проблем;
* исключить повторное обнаружение известных ошибок;
* минимизировать загрузку нерелевантных ошибок.

---

## 1. Error Logging Principle

Все ошибки фиксируются только в рамках соответствующего bounded context.

Перед внесением изменений:

1. определить архитектурный модуль;
2. открыть только соответствующий раздел журнала;
3. проверить известные ошибки;
4. зафиксировать новое отклонение только в этом разделе.

---

### Основное правило:

> Не читать весь журнал ошибок. Читать только секцию соответствующего bounded context.

---

## 2. Error Severity Levels

Каждая ошибка должна иметь уровень критичности:

### `critical`

Нарушает системный инвариант или блокирует работу.

---

### `major`

Нарушает бизнес-логику, но не блокирует систему.

---

### `minor`

Локальное отклонение без критического влияния.

---

### `warning`

Риск потенциального отклонения.

---

## 3. Error Status

Каждая ошибка должна иметь статус:

### `open`

Ошибка обнаружена и требует решения.

---

### `investigating`

Ошибка находится в анализе.

---

### `resolved`

Ошибка исправлена.

---

### `accepted`

Отклонение принято как допустимое.

---

## 4. Error Record Template

Каждая ошибка фиксируется в формате:

```md
### ERROR-XXX
Module: <bounded context>
Severity: critical | major | minor | warning
Status: open | investigating | resolved | accepted

Issue:
Краткое описание ошибки.

Impact:
Как влияет на систему.

Root Cause:
Причина возникновения.

Resolution:
Решение или план исправления.

Related ADR:
Связанный ADR при наличии.
```

---

## 5. Core Platform Errors

Ошибки верхнеуровневой архитектуры.

Использовать для:

* нарушений границ модулей;
* нарушений системных инвариантов;
* конфликтов межмодульных контрактов.

---

### ERROR-CORE-001

Module: Core Platform
Severity: warning
Status: open

Issue:
Неопределенный межмодульный контракт.

Impact:
Риск неоднозначного взаимодействия модулей.

Root Cause:
Отсутствие явного архитектурного контракта.

Resolution:
Создать или обновить ADR по межмодульному взаимодействию.

Related ADR:
ADR по domain boundaries

---

## 6. Auth & Security Errors

Ошибки безопасности, аутентификации и авторизации.

Использовать для:

* JWT проблем;
* RBAC конфликтов;
* проблем с токенами доступа.

---

### ERROR-AUTH-001

Module: Auth & Security
Severity: critical
Status: open

Issue:
Несогласованность проверки ролей на защищенных endpoints.

Impact:
Возможен несанкционированный доступ.

Root Cause:
Отсутствие унифицированной RBAC проверки.

Resolution:
Внедрить единый authorization guard.

Related ADR:
ADR-009-rbac-gp-token

---

## 7. Period Engine Errors

Ошибки жизненного цикла периода.

Использовать для:

* ошибок открытия периода;
* ошибок закрытия периода;
* нарушений workflow period state.

---

### ERROR-PERIOD-001

Module: Period Engine
Severity: critical
Status: open

Issue:
Возможность закрытия периода при незавершенных disputes.

Impact:
Нарушение целостности аналитики.

Root Cause:
Отсутствует проверка disputes перед close.

Resolution:
Добавить обязательную проверку unresolved disputes.

Related ADR:
ADR-002-period-concurrency, ADR-007-period-immutability

---

## 8. Disputes & SLA Errors

Ошибки расхождений, SLA и эскалаций.

Использовать для:

* ошибок эскалации;
* ошибок force close;
* проблем SLA automation.

---

### ERROR-SLA-001

Module: Disputes & SLA
Severity: major
Status: open

Issue:
Повторный запуск escalation worker вызывает дублирование escalation.

Impact:
Некорректные уведомления и повторные изменения статуса.

Root Cause:
Отсутствие идемпотентности worker job.

Resolution:
Добавить idempotency key для escalation event.

Related ADR:
ADR-005-sla-scheduler-reliability

---

## 9. Analytics Engine Errors

Ошибки аналитики и snapshot calculations.

Использовать для:

* ошибок readiness;
* ошибок forecasting;
* ошибок snapshots.

---

### ERROR-ANALYTICS-001

Module: Analytics Engine
Severity: critical
Status: open

Issue:
Snapshot может формироваться до завершения транзакции периода.

Impact:
Риск неконсистентной аналитики.

Root Cause:
Отсутствие transactional coupling.

Resolution:
Создавать snapshot внутри транзакции закрытия периода.

Related ADR:
ADR-004-materialized-view-staleness

---

## 10. Sync Engine Errors

Ошибки offline sync и conflict resolution.

Использовать для:

* конфликтов sync;
* потери очереди;
* ошибок retry logic.

---

### ERROR-SYNC-001

Module: Sync Engine
Severity: critical
Status: open

Issue:
Повторная sync операция может примениться дважды.

Impact:
Дублирование данных.

Root Cause:
Нет проверки idempotency key.

Resolution:
Добавить обязательную идемпотентность операций.

Related ADR:
ADR-003-offline-conflict-resolution

---

## 11. Data Layer Errors

Ошибки транзакций, audit и versioning.

Использовать для:

* ошибок optimistic locking;
* ошибок audit trail;
* ошибок tenant isolation.

---

### ERROR-DATA-001

Module: Data Layer
Severity: critical
Status: open

Issue:
Audit log создается вне транзакции изменения данных.

Impact:
Возможна потеря audit записи.

Root Cause:
Нарушение transaction boundary.

Resolution:
Включить audit запись в общую транзакцию.

Related ADR:
ADR-010-audit-log-partitioning

---

## 12. Error Routing Rules

При работе с ошибкой:

1. определить bounded context;
2. открыть только соответствующую секцию;
3. проверить существующие ошибки;
4. создать новую запись только в этой секции.

---

### Запрещено:

* читать все ошибки подряд;
* искать ошибки во всех модулях;
* писать ошибку в общий список без bounded context.

---

## 13. Error Loading Levels

---

### E1 — Module Error Context

Читать только ошибки одного bounded context.

Использовать для:

* локального анализа ошибки.

---

### E2 — Module + ADR

Читать ошибки модуля + связанный ADR.

Использовать для:

* анализа архитектурных ошибок.

---

### E3 — Cross-module Investigation

Читать несколько секций только при межмодульной ошибке.

Использовать для:

* анализа интеграционных проблем.

---

### Основное правило:

> Использовать минимальный error context, достаточный для анализа проблемы.

---

## 14. Main Principle

> Ошибки должны фиксироваться и анализироваться только в пределах соответствующего bounded context с минимальной загрузкой нерелевантного контекста.
