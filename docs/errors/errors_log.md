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

### ERROR-SECURITY-001

Module: Security / Audit Tooling
Severity: major
Status: open

Issue:
`.claude/settings.local.json` contains wildcard Bash allowlist entries (`Bash(git *)`, `Bash(node *)`, `Bash(pnpm test *)`, etc.) that fail the `allowlist-literal.js` pre-commit check. The file is gitignored but is still read by the audit suite.

Impact:
Blocks `git commit` via pre-commit hook (audit-suite exit 1) on this machine. Commits to the repo cannot be completed without `--no-verify`.

Root Cause:
Wildcard entries were added to `settings.local.json` over successive sessions to grant broad Bash tool permissions. The allowlist-literal check (added later) flags any entry with a `*` suffix as a security risk.

Resolution:
Replace wildcard entries in `.claude/settings.local.json` with specific literal allowlist entries, or add the affected wildcards to an explicit allowlist exception with justification. See `tools/audit/allowlist-literal.js` for exact rules.

Related ADR:
None (local machine configuration)

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

### REMEDIATION-2026-05-20-F001 — adr-loading-guide.md phantom catalog

File `docs/decisions/adr-loading-guide.md` rewritten — 22 phantom ADR slugs removed (e.g. ADR-010-jwt-access-refresh, ADR-020-period-lifecycle, ADR-040-snapshot-consistency). Now references only real ADR-001..ADR-015. Audit guard: `tools/audit/adr-mention-existence.js` + `__tests__/adr-mention-existence.test.js`.

### 2026-05-22T18-24-47-543Z — VIOLATIONS detected (4)

file: `docs/errors/sessions/2026-05-22T18-24-47-543Z-4c96985.md`

- FIREWALL_SELF_ATTEST: "confirmed" найдена в bootstrap
- FIREWALL_WORDCOUNT: 496 > 300
- L2_EVIDENCE_ROW_1: git_show_fail(4c969858854ccf070bb6cb3124fbf3598b56d114:.git) [source=git:4c969858854ccf070bb6cb3124fbf3598b56d114:.git]
- L2_EVIDENCE_ROW_6: quote_too_long(86B) [source=repo:CLAUDE.md]

### 2026-05-24T13-47-26-315Z — VIOLATIONS detected (5)

file: `docs/errors/sessions/2026-05-24T13-47-26-315Z-f86fdc9.md`

- FIREWALL_WORDCOUNT: 319 > 300
- L2_EVIDENCE_ROW_1: quote_too_long(116B) [source=repo:.claude/runtime/audit-turn-hook.js]
- L2_EVIDENCE_ROW_3: quote_too_long(85B) [source=repo:.claude/runtime/audit-turn-hook.js]
- L2_EVIDENCE_ROW_4: quote_too_long(111B) [source=repo:tools/audit/__tests__/audit-turn-hook.test.js]
- L2_EVIDENCE_ROW_5: quote_not_in_source [source=git:f86fdc9a639480478cc6b2d09c5dff3f23eef452:.claude/runtime/audit-turn-hook.js]

### 2026-06-01T17-38-35-439Z — VIOLATIONS detected (3)

file: `docs/errors/sessions/2026-06-01T17-38-35-439Z-91d1bc4.md`

- FIREWALL_WORDCOUNT: 643 > 300
- L2_EVIDENCE_ROW_7: quote_too_long(81B) [source=repo:docs/superpowers/specs/2026-06-01-gp-form-design.md]
- L2_EVIDENCE_ROW_14: quote_too_long(97B) [source=repo:docs/superpowers/specs/2026-06-01-gp-form-design.md]

### 2026-06-01T17-39-52-627Z — VIOLATIONS detected (3)

file: `docs/errors/sessions/2026-06-01T17-39-52-627Z-91d1bc4.md`

- FIREWALL_WORDCOUNT: 696 > 300
- L2_EVIDENCE_ROW_15: quote_too_long(84B) [source=repo:docs/superpowers/specs/2026-06-01-gp-form-design.md]
- L2_EVIDENCE_ROW_17: quote_too_long(106B) [source=repo:docs/plans/2026-06-01-gp-form.md]

### 2026-06-01T17-52-38-131Z — VIOLATIONS detected (1)

file: `docs/errors/sessions/2026-06-01T17-52-38-131Z-91d1bc4.md`

- FIREWALL_WORDCOUNT: 725 > 300

### 2026-06-01T19-00-02-648Z — VIOLATIONS detected (4)

file: `docs/errors/sessions/2026-06-01T19-00-02-648Z-067fe40.md`

- L2_EVIDENCE_ROW_2: quote_too_long(88B) [source=repo:docs/project-state.md]
- L2_EVIDENCE_ROW_3: quote_too_long(141B) [source=repo:docs/plans/2026-06-01-gp-form.md]
- L2_EVIDENCE_ROW_4: quote_not_in_anchor_window [source=repo:docs/plans/2026-06-01-gp-form.md]
- L2_EVIDENCE_ROW_5: anchor_not_found [source=git:067fe406462308e257f74a3c96b08c01ebb74be6:apps/api/src/modules/period/period.service.ts]

### 2026-06-01T19-02-38-243Z — VIOLATIONS detected (3)

file: `docs/errors/sessions/2026-06-01T19-02-38-243Z-067fe40.md`

- L2_EVIDENCE_ROW_1: quote_not_in_anchor_window [source=repo:docs/project-state.md]
- L2_EVIDENCE_ROW_4: quote_not_in_anchor_window [source=repo:apps/api/src/modules/period/period.service.ts]
- L2_EVIDENCE_ROW_5: quote_not_in_anchor_window [source=git:067fe40:apps/api/src/modules/period/period.service.ts]

### 2026-06-03T18-08-48-836Z — VIOLATIONS detected (4)

file: `docs/errors/sessions/2026-06-03T18-08-48-836Z-8147527.md`

- L2_EVIDENCE_ROW_1: quote_not_in_anchor_window [source=git:8147527:docs/plans/2026-06-02-m08-design-pass-impl.md]
- L2_EVIDENCE_ROW_2: quote_not_in_anchor_window [source=repo:apps/web/src/pages/ObjectDetailPage.tsx]
- L2_EVIDENCE_ROW_4: quote_not_in_anchor_window [source=repo:apps/web/src/pages/__tests__/DashboardPage.test.tsx]
- L2_EVIDENCE_ROW_5: quote_not_in_anchor_window [source=repo:apps/web/src/components/ProgressBar.tsx]

### 2026-06-03T18-11-16-404Z — VIOLATIONS detected (3)

file: `docs/errors/sessions/2026-06-03T18-11-16-404Z-8147527.md`

- FIREWALL_SELF_ATTEST: "verified" найдена в bootstrap
- L2_EVIDENCE_ROW_3: anchor_not_found [source=git:e1756d1:apps/web/src/components/BackLink.tsx]
- L2_EVIDENCE_ROW_6: anchor_not_found [source=repo:packages/database/src/generated/client/package.json]

---

## CLAUDE.md Audit — 2026-06-03

**Триггер:** полный (изменения в .claude/agents/ и CLAUDE.md за последние 7 дней)

**Проверки:**

### Шаг 2.1 — Document Routing
- docs/project-state.md: EXISTS
- docs/tasks/index.md: EXISTS
- packages/database/prisma/schema.prisma: EXISTS
- docs/architecture/* (14 файлов): все существуют
- Broken links: 0

### Шаг 2.2 — Таблица Intent → Agent → Backup
- Все 10 интентов имеют агентов в файловой системе
- Все backup-агенты существуют: general-purpose, ccip-backend-core, ccip-architect

### Шаг 2.2b — Frontmatter контроль
- 19 агентов в .claude/agents/: все имеют обязательные поля (name, description, tools, model, summary)
- summary поля: все <= 200 символов, без переносов строк

### Шаг 2.3 — ADR-ссылки
- 16 ADR файлов в docs/decisions/
- CLAUDE.md упоминает только ADR-016 (корректно — полный индекс в docs/decisions/index.md)

### Шаг 2.4 — Architecture docs
- 14 модулей в docs/architecture/
- Все файлы в Document Routing актуальны

### Шаг 2.5 — Backup-агенты
- [WEAK-BACKUP: ARCH] — Intent ARCH имеет backup general-purpose (рекомендуется более специальный backup, но это информационный флаг)

### Шаг 3 — Быстрая проверка
- Дублирование: нет (правила разных контекстов)
- Мёртвые правила: нет
- Устаревшие версии: docs/architecture_v1_0.md актуален
- Версионирование ADR: используются корректные ссылки (ADR-001..ADR-016)

**Итоги:**
- Broken links найдено: 0
- Новых агентов добавлено: 0
- Удалено дублирований: 0
- Изменения в CLAUDE.md требуются: нет
- Флаги в errors_log: 1 ([WEAK-BACKUP: ARCH])

**Last-Audit-SHA:** e2234c9d5ea52baa85050be08809bd65754a4f8f

---

## Agent Optimizer — ccip-doc-writer — 2026-06-03
**Rules applied (auto-fix):** 0
**Pending review:** 2
**Draft diagnostics:** 0
**Findings:** Q-04:info, C-03:info

### 2026-06-05T20-59-28-967Z — VIOLATIONS detected (2)

file: `docs/errors/sessions/2026-06-05T20-59-28-967Z-8858fd0.md`

- L2_EVIDENCE_ROW_1: quote_too_long(86B) [source=git:8858fd0:HEAD]
- L2_EVIDENCE_ROW_2: quote_too_long(118B) [source=repo:.claude/audit/agent-optimizer/rules.md]

### 2026-06-05T21-01-54-610Z — VIOLATIONS detected (2)

file: `docs/errors/sessions/2026-06-05T21-01-54-610Z-8858fd0.md`

- L2_EVIDENCE_ROW_1: anchor_not_found [source=git:8858fd0:.gitattributes]
- L2_EVIDENCE_ROW_4: quote_not_in_anchor_window [source=repo:docs/plans/2026-06-03-ccip-agent-optimizer.md]

### 2026-06-06T17-41-26-958Z — VIOLATIONS detected (4)

file: `docs/errors/sessions/2026-06-06T17-41-26-958Z-f02d7d2.md`

- FIREWALL_SELF_ATTEST: "verified" найдена в bootstrap
- L2_EVIDENCE_ROW_1: git_show_fail(f02d7d2:COMMIT) [source=git:f02d7d2:COMMIT]
- L2_EVIDENCE_ROW_2: quote_too_long(89B) [source=repo:CLAUDE.md]
- L2_EVIDENCE_ROW_3: quote_not_in_anchor_window [source=repo:tools/audit/__tests__/token-rules-apply.test.js]

---

## Navigator Optimization — 2026-06-06

**Триггер:** Red Team audit remediation — CLAUDE.md Auxiliary Agents table: триггер token-efficiency-auditor изменён с «T-01..T-10» на «T-01,T-02,T-06..T-10 (T-03/T-04/T-05 quarantine)»; заголовок секции изменён на «condition/request-triggered»; добавлено примечание об оркестрационной конвенции; ADR-016 frontmatter-пример приведён к актуальному.

**Покрытие task categories:** 8/8 покрыто (без изменений, задача — дельта-анализ)
**Расхождения L vs T уровней:** нет (правки не затронули Context/Document Routing)
**Дублирований устранено:** 0
**Broken paths:** 0 (все 21 агент-файл в .claude/agents/ существуют, включая red-team-auditor.md)
**Routing loops:** нет

**Внесённые правки:** нет — навигационный слой согласован.

**Наблюдения (без правок):**
- Согласованность триггеров: CLAUDE.md строка token-efficiency-auditor («T-01,T-02,T-06..T-10; T-03/T-04/T-05 в quarantine; см. ADR-016»), frontmatter агента (description + summary: идентичная формулировка), ADR-016 §Seed-правила (R-007/R-009/R-012 = quarantine; T-03/T-04/T-05 соответствуют им) — три источника согласованы.
- Заголовок «(condition/request-triggered, not via Intent table)» + примечание не создают конфликта с Risk Rules: security-reviewer по-прежнему описан в обоих местах (Risk Rules = «add as co-agent»; Auxiliary table = «risk:HIGH или JWT/…»), формулировки дополняют, не противоречат.
- ADR-016 упомянут в CLAUDE.md в строке token-efficiency-auditor и в §15 State Contract; в docs/decisions/index.md присутствует под «Orchestration / Agent Runtime». Ссылки согласованы.
- Различие T03/T04/T05: в ADR-016 Trigger-таблице T-03=context≥70%, T-04=token-spike, T-05=single_assistant_tokens>4000 — все три в quarantine. CLAUDE.md строка упоминает «context≥70%, token-spike» в скобках как пояснение триггеров (не routing-инструкция), расхождения маршрутизации нет.

### 2026-06-07T08-09-17-486Z — VIOLATIONS detected (5)

file: `docs/errors/sessions/2026-06-07T08-09-17-486Z-acf5a64.md`

- L2_EVIDENCE_ROW_1: quote_not_in_anchor_window [source=repo:docs/plans/2026-06-07-state-update-observability.md]
- L2_EVIDENCE_ROW_2: quote_too_long(82B) [source=repo:docs/plans/2026-06-07-state-update-observability.md]
- L2_EVIDENCE_ROW_9: quote_too_long(83B) [source=repo:docs/plans/specs/2026-06-07-state-update-observability-design.md]
- L2_EVIDENCE_ROW_10: quote_too_long(116B) [source=repo:docs/plans/specs/2026-06-07-state-update-observability-design.md]
- L2_EVIDENCE_ROW_11: quote_too_long(136B) [source=repo:docs/plans/specs/2026-06-07-state-update-observability-design.md]

### 2026-06-08T18-14-40-328Z — VIOLATIONS detected (10)

file: `docs/errors/sessions/2026-06-08T18-14-40-328Z-a68cb78.md`

- L2_EVIDENCE_ROW_1: quote_too_long(95B) [source=git:a68cb78:.]
- L2_EVIDENCE_ROW_2: git_show_fail(f6632ba:.) [source=git:f6632ba:.]
- L2_EVIDENCE_ROW_3: quote_not_in_anchor_window [source=repo:docs/schemas/session-state.schema.json]
- L2_EVIDENCE_ROW_4: quote_not_in_anchor_window [source=repo:docs/schemas/session-state.schema.json]
- L2_EVIDENCE_ROW_5: quote_too_long(84B) [source=repo:.claude/runtime/tool-telemetry.js]
- L2_EVIDENCE_ROW_7: quote_not_in_anchor_window [source=repo:.claude/runtime/read-gate.js]
- L2_EVIDENCE_ROW_8: quote_too_long(92B) [source=repo:tools/audit/rgs.js]
- L2_EVIDENCE_ROW_9: quote_not_in_anchor_window [source=repo:.claude/runtime/fallback-context.js]
- L2_EVIDENCE_ROW_11: quote_not_in_anchor_window [source=repo:tools/audit/fallback-profiles.js]
- L2_EVIDENCE_ROW_12: quote_too_long(113B) [source=repo:.claude/runtime/execute-dag.js]

### 2026-06-09T03-54-19-495Z — VIOLATIONS detected (3)

file: `docs/errors/sessions/2026-06-09T03-54-19-495Z-3fb9fe1.md`

- L2_EVIDENCE_ROW_1: quote_not_in_anchor_window [source=repo:docs/plans/2026-06-08-defect-remediation.md]
- L2_EVIDENCE_ROW_2: quote_not_in_anchor_window [source=repo:docs/plans/2026-06-08-defect-remediation.md]
- L2_EVIDENCE_ROW_8: quote_too_long(115B) [source=repo:docs/plans/2026-06-08-defect-remediation.md]

### 2026-06-09T04-27-52-795Z — VIOLATIONS detected (2)

file: `docs/errors/sessions/2026-06-09T04-27-52-795Z-122597f.md`

- L2_EVIDENCE_ROW_3: quote_not_in_anchor_window [source=repo:docs/plans/2026-06-08-defect-remediation.md]
- L2_EVIDENCE_ROW_4: quote_not_in_anchor_window [source=repo:docs/plans/2026-06-08-defect-remediation.md]

### 2026-06-09T18-27-01-928Z — VIOLATIONS detected (3)

file: `docs/errors/sessions/2026-06-09T18-27-01-928Z-8cfe4a1.md`

- L2_EVIDENCE_ROW_3: quote_not_in_anchor_window [source=repo:docs/plans/2026-05-24-dispute-sla-module.md]
- L2_EVIDENCE_ROW_4: quote_not_in_anchor_window [source=repo:docs/plans/2026-05-24-dispute-sla-module.md]
- L2_EVIDENCE_ROW_5: anchor_not_found [source=state-memory:.claude/runtime/session-state.json]

### 2026-06-11T04-14-51-744Z — VIOLATIONS detected (6)

file: `docs/errors/sessions/2026-06-11T04-14-51-744Z-54dc0ff.md`

- L2_EVIDENCE_ROW_1: quote_too_long(84B) [source=repo:docs/audits/2026-06-11-recertification-runtime-governance.md]
- L2_EVIDENCE_ROW_3: quote_not_in_anchor_window [source=repo:docs/audits/2026-06-11-recertification-runtime-governance.md]
- L2_EVIDENCE_ROW_4: quote_too_long(99B) [source=repo:docs/audits/2026-06-11-recertification-runtime-governance.md]
- L2_EVIDENCE_ROW_5: quote_too_long(87B) [source=repo:docs/audits/2026-06-11-recertification-runtime-governance.md]
- L2_EVIDENCE_ROW_6: quote_not_in_anchor_window [source=repo:docs/audits/2026-06-11-recertification-runtime-governance.md]
- L2_EVIDENCE_ROW_9: quote_too_long(124B) [source=repo:docs/audits/2026-06-10-certification-runtime-governance.md]

### 2026-06-12T06-09-10-761Z — VIOLATIONS detected (7)

file: `docs/errors/sessions/2026-06-12T06-09-10-761Z-472c55c.md`

- L2_EVIDENCE_ROW_1: quote_too_long(81B) [source=repo:docs/audits/2026-06-11-recertification-advanced-enterprise.md]
- L2_EVIDENCE_ROW_3: quote_too_long(85B) [source=repo:docs/audits/2026-06-11-recertification-advanced-enterprise.md]
- L2_EVIDENCE_ROW_7: quote_not_in_anchor_window [source=repo:docs/plans/2026-06-11-advanced-enterprise-cross-process-lock.md]
- L2_EVIDENCE_ROW_8: quote_too_long(83B) [source=repo:docs/audits/2026-06-11-recertification-advanced-enterprise.md]
- L2_EVIDENCE_ROW_9: quote_too_long(87B) [source=repo:docs/plans/2026-06-11-advanced-enterprise-cross-process-lock.md]
- L2_EVIDENCE_ROW_10: quote_too_long(97B) [source=repo:docs/audits/2026-06-12-capability-assessment.md]
- L2_EVIDENCE_ROW_11: quote_not_in_anchor_window [source=repo:docs/plans/2026-06-11-advanced-enterprise-cross-process-lock.md]

### 2026-06-14T16-25-23-091Z — VIOLATIONS detected (2)

file: `docs/errors/sessions/2026-06-14T16-25-23-091Z-1212d4e.md`

- L2_EVIDENCE_ROW_4: quote_not_in_anchor_window [source=repo:.claude/runtime/execute-dag.js]
- L2_EVIDENCE_ROW_9: anchor_not_found [source=repo:docs/plans/2026-06-12-capability-xii-roadmap.md]

### 2026-06-15T04-40-19-458Z — VIOLATIONS detected (2)

file: `docs/errors/sessions/2026-06-15T04-40-19-458Z-1eb4c70.md`

- L2_EVIDENCE_ROW_5: quote_too_long(86c) [source=repo:docs/plans/2026-06-12-capability-xii-roadmap.md]
- L2_EVIDENCE_ROW_8: anchor_not_found [source=repo:docs/audits/2026-06-12-capability-assessment.md]

### 2026-06-15T04-43-07-226Z — VIOLATIONS detected (5)

file: `docs/errors/sessions/2026-06-15T04-43-07-226Z-1eb4c70.md`

- L2_EVIDENCE_ROW_2: quote_too_short(3B) [source=repo:docs/errors/session-opt-index.md]
- L2_EVIDENCE_ROW_4: quote_not_in_anchor_window [source=repo:docs/plans/2026-06-12-capability-xii-roadmap.md]
- L2_EVIDENCE_ROW_6: quote_too_short(7B) [source=repo:docs/plans/2026-06-12-capability-xii-roadmap.md]
- L2_EVIDENCE_ROW_7: source_file_missing [source=repo:docs/decisions/ADR-026.md]
- L2_EVIDENCE_ROW_9: quote_not_in_anchor_window [source=repo:docs/plans/2026-06-12-capability-xii-roadmap.md]

### 2026-06-15T18-55-17-577Z — VIOLATIONS detected (3)

file: `docs/errors/sessions/2026-06-15T18-55-17-577Z-2811b1d.md`

- L2_EVIDENCE_ROW_1: anchor_not_found [source=repo:docs/audits/2026-06-12-capability-assessment.md]
- L2_EVIDENCE_ROW_2: anchor_not_found [source=repo:docs/audits/2026-06-12-capability-assessment.md]
- L2_EVIDENCE_ROW_6: quote_not_in_anchor_window [source=repo:docs/decisions/ADR-028-formal-invariant-model.md]
