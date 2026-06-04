# Proposed Agent Changes

Накопитель изменений, которые `ccip-agent-optimizer` не может применить автоматически.
Каждая запись требует явного подтверждения пользователя перед применением.

**Формат записи:**

```markdown
## <agent-name> — <YYYY-MM-DD>
**Rule:** <ID> · **Severity:** <severity>
**Location:** <строка/секция>
**Current:** "<текущий текст>"
**Proposed:** "<предлагаемый текст>"
**Status:** PENDING_HUMAN_REVIEW
```

После применения изменений вручную — поменять `Status` на `APPLIED` или удалить запись.

---

## ccip-backend-core — 2026-06-04
**Rule:** R-05 · **Severity:** warning
**Location:** §Правила работы
**Current:** Раздел не содержит запрета на вывод env-переменных, токенов, секретов при выполнении Bash-операций
**Proposed:** Добавить правилом 7 в §Правила работы:
```
7. Bash-операции: никогда не выводить и не логировать значения env-переменных, токенов, API-ключей и паролей. При необходимости — маскировать.
```
**Status:** PENDING_HUMAN_REVIEW

---

## ccip-backend-core — 2026-06-04
**Rule:** G-04 · **Severity:** info
**Location:** body — отсутствует секция с измеримыми success-criteria
**Current:** Агент описывает задачи, но не задаёт явных критериев приёмки (кроме getCumulativeFactsBatch < 100 ms)
**Proposed:** Добавить секцию:
```markdown
## Критерии успеха
- getCumulativeFactsBatch: p99 < 100 ms при N ≤ 500 позиций
- State transitions: все переходы покрыты unit-тестами из тест-таблицы Алгоритма Part 4
- BullMQ jobs: retry-стратегия и DLQ прописаны для каждого worker
- Idempotency: каждая операция изменения периода имеет idempotency_key и проверку на повтор
- PDF: async job ставится в очередь при closePeriod, результат доступен через S3-ссылку
```
**Status:** PENDING_HUMAN_REVIEW

---

## ccip-doc-writer — 2026-06-03
**Rule:** Q-04 · **Severity:** info
**Location:** строка 16 (упоминание ADR-001..ADR-016), отсутствует секция `## Ключевые ADR`
**Current:** ADR-ссылки присутствуют в теле (строка 16: `ADR-001..ADR-016`), но секция `## Ключевые ADR` отсутствует
**Proposed:** Добавить секцию после `## Принципы документации CCIP`:
```markdown
## Ключевые ADR
- ADR-001..ADR-016 — полный реестр в `docs/decisions/index.md`
- При написании нового ADR — использовать шаблон из секции "Шаблон ADR" выше
```
**Status:** APPLIED 2026-06-03

## ccip-doc-writer — 2026-06-03
**Rule:** C-03 · **Severity:** info
**Location:** frontmatter, строка 6: `model: claude-haiku-4-5-20251001`
**Current:** `model: claude-haiku-4-5-20251001`
**Proposed:** `model: claude-sonnet-4-6`
**Rationale:** Агент выполняет write + семантические задачи: написание ADR, пользовательских руководств, CLAUDE.md. По правилу C-03 — `claude-haiku-4-5-20251001` только для read-only агентов; write + семантика требует `claude-sonnet-4-6`.
**Status:** APPLIED 2026-06-03

---

## ccip-security — 2026-06-04
**Rule:** Q-03 · **Severity:** warning
**Location:** body — секция явных запретов отсутствует
**Current:** Агент высокого риска (ccip-security), но раздела "## Жёсткие ограничения" или эквивалентного нет
**Proposed:** Добавить секцию после §Правила работы:
```markdown
## Жёсткие ограничения
- Не модифицировать `CLAUDE.md` — зона ccip-claude-md-auditor
- Не применять миграции напрямую — только через ccip-dba или явное одобрение
- Не вносить правки в RBAC/RLS без security-reviewer как co-agent (CLAUDE.md Risk Rules)
- Не читать и не логировать значения секретов/токенов/env-переменных
- Не выполнять деструктивные Bash-операции (rm -rf, DROP) без явного ACK пользователя
```
**Status:** PENDING_HUMAN_REVIEW

---

## ccip-security — 2026-06-04
**Rule:** R-05 · **Severity:** warning
**Location:** §Правила работы — правило 2 о секретах
**Current:** Правило 2: "Все секреты — ротация не реже раза в квартал, никогда в коде." Это о хранении, не о запрете вывода в stdout/лог при Bash-операциях
**Proposed:** Добавить правилом 6 в §Правила работы:
```
6. Bash-операции: никогда не выводить и не логировать значения env-переменных, токенов, API-ключей и паролей. При необходимости маскировать (***).
```
**Status:** PENDING_HUMAN_REVIEW

---

## ccip-security — 2026-06-04
**Rule:** G-04 · **Severity:** info
**Location:** body — измеримые success-criteria отсутствуют
**Current:** Агент описывает задачи, но не задаёт явных критериев приёмки (кроме "обязательный security review отчёт перед пилотом")
**Proposed:** Добавить секцию:
```markdown
## Критерии успеха
- DB REVOKE: ADR-007/010 подтверждены integration-тестом (ccip_app не может UPDATE/DELETE)
- RLS: cross-tenant запрос возвращает 0 строк при явном тесте (ADR-012)
- GpToken: scope содержит только минимально необходимые права, подтверждено code-review
- Audit log: попытка UPDATE/DELETE на audit_log завершается ошибкой в integration-тесте
- Pre-launch: security review отчёт закрыт без open critical findings перед этапом 13
```
**Status:** PENDING_HUMAN_REVIEW

---

## ccip-security — 2026-06-04
**Rule:** G-05 · **Severity:** info
**Location:** §State Contract — handoff-контракт не структурирован
**Current:** `handoff_notes` содержит inline-пример "severity:critical → BLOCK; required ACK перед merge", но явный контракт (что именно передавать) не задан
**Proposed:** Добавить в §State Contract перед блоком:
```
> Handoff-контракт: в `handoff_notes` указывать — (1) severity критических findings, (2) какие ADR затронуты, (3) требуется ли ACK перед merge/deploy, (4) незакрытые риски для следующего агента.
```
**Status:** PENDING_HUMAN_REVIEW

---

## consistency-checker — 2026-06-04
**Rule:** G-05 · **Severity:** info
**Location:** §State Update (конец файла)
**Current:** `"handoff_notes": ""` — поле пустое, нет инструкции что писать следующему агенту
**Proposed:** добавить перед шаблоном инструкцию: "В `handoff_notes` указывать: список найденных CONTRADICTION-NNN, scope проверки и рекомендованного исполнителя для разрешения."
**Status:** PENDING_HUMAN_REVIEW

---
