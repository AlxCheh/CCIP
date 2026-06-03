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
