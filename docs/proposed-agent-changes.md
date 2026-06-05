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

## ccip-backend-core — 2026-06-05
**Rule:** Q-01 · **Severity:** info
**Location:** §Правила работы, правило 7 — "При необходимости — маскировать."
**Current:** "Bash-операции: никогда не выводить и не логировать значения env-переменных, токенов, API-ключей и паролей. При необходимости — маскировать."
**Proposed:** Убрать размытый хвост "При необходимости — маскировать." — он противоречит запрету выводить секреты: либо запрещено, либо маскируется, но критерий выбора отсутствует. Предлагаемая формулировка: "Bash-операции: никогда не выводить и не логировать значения env-переменных, токенов, API-ключей и паролей. Если для диагностики нужно подтвердить наличие значения — выводить только `[SET]` / `[EMPTY]`."
**Status:** APPLIED 2026-06-05

## ccip-backend-core — 2026-06-05
**Rule:** R-02 · **Severity:** info
**Location:** §Стек + §Правила работы — Bash в tools без явного scope
**Current:** `tools: Read, Write, Edit, Glob, Grep, Bash` — Bash ограничен только запретом вывода секретов (правило 7), domain-scope операций не объявлен.
**Proposed:** Добавить в §Правила работы явный Bash-scope, например правилом 8: "Bash: разрешены только операции build/test/lint и DB-migrate (`pnpm` / `prisma migrate`). deploy, curl/wget, destructive rm, прямые сетевые вызовы — запрещены."
**Status:** APPLIED 2026-06-05

## ccip-backend-core — 2026-06-05
**Rule:** R-06 · **Severity:** warning
**Location:** §Правила работы — отсутствует требование server-side валидации входных данных
**Current:** §Правила работы не содержит явного требования валидировать входные данные на сервере (schema-validation, parametrized queries, запрет eval/raw-concat). Агент работает с trust-boundary: server-side endpoint'ы PeriodEngine, DisputeSLA, Analytics.
**Proposed:** Добавить в §Правила работы правило: "Входные данные всех endpoint'ов — валидировать через class-validator/Zod DTO на сервере; использовать Prisma parametrized queries; raw-конкатенация SQL и eval — запрещены. Client-side валидация не заменяет server-side."
**Status:** APPLIED 2026-06-05

---

## ccip-doc-writer — 2026-06-05
**Rule:** G-04 · **Severity:** info
**Location:** §Правила работы — отсутствуют измеримые критерии завершения задач
**Current:** Правила работы описывают процессы (diff-only, версионирование, ADR-шаблон), но не декларируют acceptance criteria: когда документ считается «готовым», что является успешным результатом прогона агента.
**Proposed:** Добавить в §Правила работы явные критерии приёмки, например: "Документ считается обновлённым, когда: (a) версия в заголовке увеличена; (b) изменены только затронутые секции; (c) ссылки в теле ведут на существующие файлы. ADR считается готовым, когда все 5 секций (Status, Context, Decision, Consequences, Date) заполнены."
**Status:** PENDING_HUMAN_REVIEW

---
