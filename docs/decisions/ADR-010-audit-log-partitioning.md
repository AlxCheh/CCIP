# ADR-010 — Audit Log: партиционирование и append-only гарантии

**Статус:** Принято rev 2
**Закрытый риск:** R-10

## Решение
Ежемесячные RANGE-партиции по `performed_at` + `pg_partman` с `premake=3` + индекс `(table_name, record_id)` на каждой партиции + алерт на `audit_log_default > 0`.

## Контекст
`audit_log` растёт неограниченно. Без партиционирования деградирует INSERT, архивация требует блокирующего DELETE. Если партиции не созданы заранее — строки попадают в `audit_log_default` и становятся узким местом.

## Практический кейс
Апрель: `pg_partman` с `premake=3` автоматически создал партиции за май, июнь, июль. Admin запрашивает `GET /admin/health/audit-log`: `defaultPartitionRowCount=0`, `isHealthy=true`, `upcomingPartitions=['audit_log_2026_05','audit_log_2026_06','audit_log_2026_07']`. В феврале следующего года партиция `audit_log_2025_02` (>12 мес) переносится в `archive_ts` в окно обслуживания.

## Контракт реализации

**P-15 (schema.sql):**
```sql
CREATE TABLE audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  table_name VARCHAR(100) NOT NULL, record_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL, old_data JSONB, new_data JSONB,
  reason TEXT, performed_by INTEGER REFERENCES users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, performed_at)   -- composite PK: включает partition key
) PARTITION BY RANGE (performed_at);
CREATE INDEX idx_audit_log_record ON audit_log (table_name, record_id);
CREATE TABLE audit_log_default PARTITION OF audit_log DEFAULT;
```

**pg_partman:** `create_parent(p_parent_table='public.audit_log', p_control='performed_at', p_type='range', p_interval='monthly', p_premake=3)`. Maintenance: `CALL partman.run_maintenance_proc()` по расписанию (pg_cron).

**Health check `GET /admin/health/audit-log`:** проверяет `COUNT(*) FROM audit_log_default` (должно быть 0), `partman.part_config.last_run`, партиции на следующие 3 месяца. `isHealthy = defaultRowCount==0 AND upcomingPartitions.length>=2`.

**Архивация:** `ALTER TABLE audit_log_YYYY_MM SET TABLESPACE archive_ts` — партиции старше 12 мес, ежеквартально в окно обслуживания.

**Append-only:** `REVOKE UPDATE, DELETE ON audit_log FROM ccip_app` (P-25, ADR-007). `AuditLogService` предоставляет только `create()`.

**Инварианты:**
- `audit_log_default` должен содержать 0 строк в штатной работе — алерт операционное требование
- `premake=3` — новые строки никогда не попадают в `default` при штатной работе
- Composite PK `(id, performed_at)` — применяется при создании таблицы, изменение требует пересоздания
- `idx_audit_log_record` — обязателен

## Отклонённые альтернативы
| Альтернатива | Причина |
|---|---|
| Партиционирование по `table_name` | Неравномерное распределение; нет ускорения архивации по времени |
| Quarterly партиции | Слишком крупные партиции; архивация реже |
| TimescaleDB | Избыточно для монолита; отдельное расширение |
