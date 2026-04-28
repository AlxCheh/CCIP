# Analytics Engine Error Log

Журнал ошибок модуля Analytics Engine.

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

- **module**: analytics-engine
- **operation**: [operation-name]
- **error_type**: [error-type]
- **cause**: [description]
- **resolution**: open
- **notes**: —
```

---

## Known Error Patterns

- `SNAPSHOT_GENERATION_FAILED` — ошибка генерации снапшота готовности
- `READINESS_CALC_ERROR` — ошибка расчёта коэффициента готовности
- `FORECAST_DATA_MISSING` — недостаточно данных для прогноза
- `MV_REFRESH_FAILED` — materialized view не обновился
- `AGGREGATION_TIMEOUT` — агрегация дашборда превысила таймаут

---

## Escalation Rules

Если ошибка не решена в течение:

- **critical** — 1 час → escalated немедленно
- **high** — 4 часа → escalated к lead
- **medium** — 24 часа → в backlog
- **low** — 72 часа → tech debt
