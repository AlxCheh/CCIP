# Optimization Log

Журнал запусков `ccip-agent-optimizer`. Каждая запись — один запуск агента на одном целевом файле.

**Читать:** только секцию нужного агента — не весь файл.

---

## Формат записи

```
## Agent Optimizer — <agent-name> — <YYYY-MM-DD>
**Rules applied (auto-fix):** <N>
**Pending review:** <N>
**Draft diagnostics:** <N>
**Findings:** <rule-id>:<severity>, ...
**Errors:** <описание> | none
```

---
