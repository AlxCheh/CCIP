# Error Routing Index

Этот каталог содержит журнал ошибок платформы CCIP, распределенный по bounded contexts.

Цель:

* сократить загрузку контекста при анализе ошибок;
* направлять агента к нужному журналу ошибок;
* исключить чтение полного error log;
* обеспечить модульный анализ проблем.

Основной принцип:

> При анализе ошибки загружать только error log соответствующего bounded context.

---

## 1. Error Categories

Ошибки разделены по архитектурным модулям:

1. Auth & Security
2. Period Engine
3. Disputes & SLA
4. Analytics Engine
5. Sync Engine
6. Data Layer
7. Infrastructure
8. Integrations

---

## 2. Auth & Security Errors

Использовать для ошибок:

* login failures
* JWT validation
* RBAC denials
* refresh token issues
* unauthorized access

Файл:

`docs/errors/auth-errors.md`

---

## 3. Period Engine Errors

Использовать для ошибок:

* period open failures
* invalid period transitions
* period close rejection
* missing zero-report
* invalid period state

Файл:

`docs/errors/period-errors.md`

---

## 4. Disputes & SLA Errors

Использовать для ошибок:

* dispute creation failures
* SLA escalation failures
* unresolved disputes
* force close failures
* escalation worker issues

Файл:

`docs/errors/disputes-errors.md`

---

## 5. Analytics Engine Errors

Использовать для ошибок:

* snapshot generation failures
* readiness calculation errors
* forecast errors
* dashboard aggregation failures

Файл:

`docs/errors/analytics-errors.md`

---

## 6. Sync Engine Errors

Использовать для ошибок:

* sync queue failures
* version conflicts
* offline sync failures
* idempotency violations
* retry failures

Файл:

`docs/errors/sync-errors.md`

---

## 7. Data Layer Errors

Использовать для ошибок:

* transaction rollback
* optimistic locking conflict
* audit write failure
* version mismatch
* integrity constraint violation

Файл:

`docs/errors/data-errors.md`

---

## 8. Infrastructure Errors

Использовать для ошибок:

* worker failures
* queue failures
* scheduler failures
* deployment issues
* monitoring alerts

Файл:

`docs/errors/infra-errors.md`

---

## 9. Integration Errors

Использовать для ошибок:

* notification failures
* storage failures
* external API failures
* webhook errors

Файл:

`docs/errors/integration-errors.md`

---

## 10. Error Routing Rules

Перед чтением error log необходимо:

1. определить bounded context ошибки;
2. выбрать соответствующий error file;
3. загрузить только этот журнал ошибок;
4. не читать остальные журналы.

---

### Пример маршрутизации:

Если ошибка связана с:

* JWT → `auth-errors.md`
* period close → `period-errors.md`
* snapshot → `analytics-errors.md`
* sync conflict → `sync-errors.md`
* audit failure → `data-errors.md`

---

## 11. Error Loading Levels

### E1 — No Error Log

Если ошибка локальна и не требует исторического анализа.

Примеры:

* lint error
* syntax error
* typo fix

---

### E2 — Single Module Error Log

Если ошибка относится к одному bounded context.

Примеры:

* JWT validation error
* period state error
* sync retry failure

---

### E3 — Cross-module Error Logs

Если ошибка затрагивает взаимодействие нескольких модулей.

Примеры:

* sync + data conflict
* period close + analytics failure

---

### Правило:

> Запрещено загружать несколько error logs без подтверждения cross-module ошибки.

---

## 12. Error Priority Rules

Если ошибка затрагивает несколько слоев, приоритет анализа:

1. Data Layer
2. Sync Engine
3. Period Engine
4. Analytics Engine
5. Infrastructure
6. Integrations

---

### Основной принцип:

> Ошибки консистентности данных имеют высший приоритет перед ошибками бизнес-логики.

---

## 13. Error Logging Rules

Каждая ошибка должна фиксироваться в соответствующем модуле и содержать:

1. timestamp
2. module name
3. operation
4. error type
5. cause
6. resolution status

---

### Обязательный формат записи:

* время ошибки;
* контекст операции;
* причина ошибки;
* статус исправления.

---

## 14. Resolution Rules

При анализе ошибки:

1. определить модуль;
2. проверить журнал соответствующего bounded context;
3. определить известный паттерн ошибки;
4. применить корректирующее действие;
5. зафиксировать resolution.

---

### Правило:

> Исправление ошибки должно быть зафиксировано в том же error log, где зарегистрирована ошибка.

---

## 15. Escalation Rules

Если ошибка не решена:

1. ошибка получает статус escalated;
2. назначается ответственный модуль;
3. создается задача на исправление;
4. обновляется статус resolution.

---

### Ограничение:

> Ошибка не должна оставаться в unresolved состоянии без владельца.

---

## 16. Read Policy

При анализе ошибки:

1. сначала читать `docs/errors/index.md`;
2. определить bounded context;
3. открыть только соответствующий error log;
4. не читать все журналы ошибок.

---

### Запрещено:

* читать все error logs подряд;
* искать ошибки во всех модулях одновременно;
* загружать cross-module error logs без необходимости.

---

## 17. Main Principle

> Error routing должен направлять агента только к минимально необходимому журналу ошибок для анализа проблемы.
