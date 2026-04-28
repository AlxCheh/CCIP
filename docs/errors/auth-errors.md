# Auth & Security Error Log

Журнал ошибок модуля Auth & Security.

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

- **module**: auth
- **operation**: [operation-name]
- **error_type**: [error-type]
- **cause**: [description]
- **resolution**: open
- **notes**: —
```

---

## Known Error Patterns

- `JWT_EXPIRED` — токен истёк, требуется refresh
- `RBAC_DENIED` — недостаточно прав для операции
- `REFRESH_TOKEN_INVALID` — refresh token не найден или отозван
- `SESSION_NOT_FOUND` — сессия не существует
- `UNAUTHORIZED_TENANT_ACCESS` — попытка доступа к чужому тенанту

---

## Escalation Rules

Если ошибка не решена в течение:

- **critical** — 1 час → escalated немедленно
- **high** — 4 часа → escalated к lead
- **medium** — 24 часа → в backlog
- **low** — 72 часа → tech debt
