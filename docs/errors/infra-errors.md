# Infrastructure Error Log

Журнал ошибок модуля Infrastructure.

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

- **module**: infrastructure
- **operation**: [operation-name]
- **error_type**: [error-type]
- **cause**: [description]
- **resolution**: open
- **notes**: —
```

---

## Known Error Patterns

- `BULLMQ_WORKER_CRASH` — воркер BullMQ упал без обработки ошибки
- `REDIS_AOF_SYNC_LAG` — отставание AOF от текущего состояния Redis
- `SCHEDULER_MISSED_RUN` — планировщик пропустил запланированный запуск
- `DEPLOYMENT_ROLLBACK` — откат деплоя из-за health check failure
- `PGBOUNCER_POOL_EXHAUSTED` — пул соединений PgBouncer исчерпан

---

## Escalation Rules

Если ошибка не решена в течение:

- **critical** — 1 час → escalated немедленно
- **high** — 4 часа → escalated к lead
- **medium** — 24 часа → в backlog
- **low** — 72 часа → tech debt
