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

### 2026-05-16T15-08-46-650Z — VIOLATIONS detected (3)

file: `docs/errors/sessions/2026-05-16T15-08-46-650Z-a17ca4a.md`

- FIREWALL_BOOTSTRAP_MISSING
- L2_EVIDENCE_ROW_3: quote_not_in_source [source=repo:.claude/runtime/verify-evidence-log.js]
- L2_EVIDENCE_ROW_6: quote_too_long(110B) [source=state-memory:C:\Users\user\.claude\projects\W--Claude-CCIP\memory\zero_drift_section10_state.md]

### 2026-05-16T19-15-17-191Z — VIOLATIONS detected (2)

file: `docs/errors/sessions/2026-05-16T19-15-17-191Z-7f167aa.md`

- FIREWALL_WORDCOUNT: 354 > 300
- L2_EVIDENCE_ROW_5: quote_too_long(101B) [source=state-memory:C:\Users\user\.claude\projects\W--Claude-CCIP\memory\zero_drift_section10_state.md]

### 2026-05-16T20-28-46-000Z — VIOLATIONS detected (2)

file: `docs/errors/sessions/2026-05-16T20-28-46-000Z-8da044c.md`

- L2_EVIDENCE_ROW_1: quote_too_long(122B) [source=repo:docs/refactor/session-optimizer-skill-scope.md]
- L2_EVIDENCE_ROW_2: source_file_missing [source=state-memory:memory/zero_drift_section10_state.md]

### 2026-05-17T07-32-21-925Z — VIOLATIONS detected (11)

file: `docs/errors/sessions/2026-05-17T07-32-21-925Z-f2b8288.md`

- FIREWALL_SELF_ATTEST: "verified" найдена в bootstrap
- FIREWALL_WORDCOUNT: 672 > 300
- L2_EVIDENCE_ROW_1: quote_not_in_source [source=git:f2b8288300be9a32c6c03ba95a5ed88a71cc7a43:.github/workflows/ci.yml]
- L2_EVIDENCE_ROW_4: quote_too_long(106B) [source=repo:docs/plans/2026-05-15-auditlog-partman-implementation.md]
- L2_EVIDENCE_ROW_5: quote_too_long(112B) [source=repo:docs/plans/2026-05-15-auditlog-partman-implementation.md]
- L2_EVIDENCE_ROW_6: quote_too_long(88B) [source=repo:docs/plans/2026-05-17-multi-agent-ecosystem-residual-remediation.md]
- L2_EVIDENCE_ROW_8: quote_too_long(96B) [source=repo:docs/plans/2026-05-17-multi-agent-ecosystem-residual-remediation.md]
- L2_EVIDENCE_ROW_10: quote_not_in_source [source=state-memory:C:\Users\user\.claude\projects\W--Claude-CCIP\memory\zero_drift_section10_state.md]
- L2_EVIDENCE_ROW_11: quote_too_long(132B) [source=state-memory:C:\Users\user\.claude\projects\W--Claude-CCIP\memory\zero_drift_section10_state.md]
- L2_EVIDENCE_ROW_12: quote_too_long(139B) [source=state-memory:C:\Users\user\.claude\projects\W--Claude-CCIP\memory\feedback_no_prompt_markers.md]
- L2_EVIDENCE_ROW_13: quote_too_long(193B) [source=state-memory:C:\Users\user\.claude\projects\W--Claude-CCIP\memory\audit_cross_doc_allowlist.md]

### 2026-05-17T20-14-50-549Z — VIOLATIONS detected (11)

file: `docs/errors/sessions/2026-05-17T20-14-50-549Z-72282cc.md`

- FIREWALL_WORDCOUNT: 579 > 300
- L2_EVIDENCE_ROW_2: quote_too_long(119B) [source=repo:docs/plans/2026-05-17-multi-agent-ecosystem-residual-remediation.md]
- L2_EVIDENCE_ROW_3: quote_too_long(114B) [source=repo:docs/plans/2026-05-17-multi-agent-ecosystem-residual-remediation.md]
- L2_EVIDENCE_ROW_4: quote_too_long(145B) [source=repo:docs/plans/2026-05-17-multi-agent-ecosystem-residual-remediation.md]
- L2_EVIDENCE_ROW_5: quote_too_long(128B) [source=repo:docs/plans/2026-05-17-multi-agent-ecosystem-residual-remediation.md]
- L2_EVIDENCE_ROW_6: git_show_fail(72282cc4cb1bb137f8c16a6aa4b0d75479226c39:.) [source=git:72282cc4cb1bb137f8c16a6aa4b0d75479226c39:.]
- L2_EVIDENCE_ROW_7: git_show_fail(50c731b55e0cd74245581d513738d73ec780bad8:.) [source=git:50c731b55e0cd74245581d513738d73ec780bad8:.]
- L2_EVIDENCE_ROW_8: git_show_fail(5f0b4c79f9ed9ab1c128f1c6917a6d264e22fee2:.) [source=git:5f0b4c79f9ed9ab1c128f1c6917a6d264e22fee2:.]
- L2_EVIDENCE_ROW_9: git_show_fail(f0292f0e5336eb053f37258e71e729c4880029d1:.) [source=git:f0292f0e5336eb053f37258e71e729c4880029d1:.]
- L2_EVIDENCE_ROW_10: git_show_fail(25f0e68cd497e13f2305f5c63bf454a1ed86a647:.) [source=git:25f0e68cd497e13f2305f5c63bf454a1ed86a647:.]
- L2_EVIDENCE_ROW_13: quote_too_long(179B) [source=repo:docs/plans/2026-05-17-multi-agent-ecosystem-residual-remediation.md]
