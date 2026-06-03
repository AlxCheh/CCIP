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
