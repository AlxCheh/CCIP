# Disputes & SLA Error Log

Журнал ошибок модуля Disputes & SLA.

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

- **module**: disputes-sla
- **operation**: [operation-name]
- **error_type**: [error-type]
- **cause**: [description]
- **resolution**: open
- **notes**: —
```

---

## Known Error Patterns

- `DISPUTE_CREATION_FAILED` — не удалось создать диспут
- `SLA_ESCALATION_FAILED` — воркер эскалации не отработал
- `FORCE_CLOSE_REJECTED` — принудительное закрытие отклонено
- `DISPUTE_ALREADY_RESOLVED` — диспут уже разрешён
- `ESCALATION_WORKER_CRASH` — BullMQ worker упал при эскалации

---

## Escalation Rules

Если ошибка не решена в течение:

- **critical** — 1 час → escalated немедленно
- **high** — 4 часа → escalated к lead
- **medium** — 24 часа → в backlog
- **low** — 72 часа → tech debt
