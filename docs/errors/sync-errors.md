# Sync Engine Error Log

Журнал ошибок модуля Sync Engine.

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

- **module**: sync-engine
- **operation**: [operation-name]
- **error_type**: [error-type]
- **cause**: [description]
- **resolution**: open
- **notes**: —
```

---

## Known Error Patterns

- `VERSION_CONFLICT` — конфликт версий при merge офлайн-данных
- `IDEMPOTENCY_VIOLATION` — повторная запись с тем же идемпотентным ключом
- `SYNC_QUEUE_OVERFLOW` — очередь синхронизации переполнена
- `OFFLINE_DELTA_CORRUPT` — повреждённая дельта офлайн-данных
- `RETRY_LIMIT_EXCEEDED` — превышен лимит повторных попыток синхронизации

---

## Escalation Rules

Если ошибка не решена в течение:

- **critical** — 1 час → escalated немедленно
- **high** — 4 часа → escalated к lead
- **medium** — 24 часа → в backlog
- **low** — 72 часа → tech debt
