# Period Engine Error Log

Журнал ошибок модуля Period Engine.

Формат записи: timestamp · module · operation · error type · cause · resolution status

---

## Active Errors

_No active errors._

---

## Resolved Errors

_No resolved errors._

---

## Error Format

Each entry must contain:

- **timestamp** — время возникновения
- **module** — bounded context
- **operation** — название операции
- **error_type** — тип ошибки
- **cause** — причина
- **resolution** — статус: `open` | `in_progress` | `resolved` | `escalated`

---

### Entry Template

```
### [YYYY-MM-DD HH:MM] — [ErrorType]

- **module**: period-engine
- **operation**: [operation-name]
- **error_type**: [error-type]
- **cause**: [description]
- **resolution**: open
- **notes**: —
```

---

## Known Error Patterns

- `INVALID_PERIOD_TRANSITION` — недопустимый переход состояния периода
- `PERIOD_ALREADY_CLOSED` — период уже закрыт
- `MISSING_ZERO_REPORT` — нулевой отчёт не подан
- `PERIOD_OPEN_CONFLICT` — попытка открыть период при существующем активном
- `WORK_ITEM_NOT_FOUND` — работа не найдена при закрытии периода

---

## Escalation Rules

Если ошибка не решена в течение:

- **critical** — 1 час → escalated немедленно
- **high** — 4 часа → escalated к lead
- **medium** — 24 часа → в backlog
- **low** — 72 часа → tech debt
