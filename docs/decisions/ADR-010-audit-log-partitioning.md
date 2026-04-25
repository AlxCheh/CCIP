# ADR-010 — Audit Log: партиционирование и append-only гарантии

**Статус:** Принято (rev 2 — 2026-04-25)  
**Дата:** 2026-04-25  
**Риск:** R-10

## Проблема

`audit_log` растёт неограниченно: каждая запись SC, каждая Admin-корректировка, каждый resolved конфликт создаёт строку. Без партиционирования:
- Таблица деградирует по скорости INSERT при миллионах строк.
- Запрос `WHERE record_id = :id` без partition pruning выполняет full scan.
- Архивация старых записей требует `DELETE` по всей таблице — долгая блокирующая операция.

Дополнительный риск: если партиции не создаются заранее, PostgreSQL помещает новые строки в `audit_log_default`. При достаточном объёме это становится узким местом.

## Решение

**Ежемесячные RANGE-партиции по `performed_at` + `pg_partman` для автосоздания + индекс `(table_name, record_id)` на каждой партиции.**

## Контракт схемы БД

```sql
-- Уже присутствует в schema.sql (P-15)
-- Composite PK (id, performed_at) — корректен для partitioned tables в PostgreSQL:
-- PRIMARY KEY должен включать partition key.
-- Примечание: изменение PK требует пересоздания таблицы; применяется при первоначальном создании.
CREATE TABLE audit_log (
    id             UUID         NOT NULL DEFAULT gen_random_uuid(),
    table_name     VARCHAR(100) NOT NULL,
    record_id      UUID         NOT NULL,
    action         VARCHAR(50)  NOT NULL,
    old_data       JSONB,
    new_data       JSONB,
    reason         TEXT,
    performed_by   INTEGER      REFERENCES users(id),
    performed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, performed_at)   -- composite: включает partition key
) PARTITION BY RANGE (performed_at);

-- Явные партиции на ближайшие периоды
CREATE TABLE audit_log_2026_04 PARTITION OF audit_log
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE audit_log_2026_05 PARTITION OF audit_log
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- Дефолтная партиция — предохранитель, не основное хранилище
CREATE TABLE audit_log_default PARTITION OF audit_log DEFAULT;

-- Индекс на каждой партиции (создаётся автоматически через PARTITION OF)
CREATE INDEX idx_audit_log_record ON audit_log (table_name, record_id);
```

## pg_partman — автосоздание партиций

```sql
SELECT partman.create_parent(
    p_parent_table := 'public.audit_log',
    p_control      := 'performed_at',
    p_type         := 'range',
    p_interval     := 'monthly',
    p_premake      := 3     -- создаёт следующие 3 месяца заранее
);

-- Запуск по расписанию (pg_cron):
CALL partman.run_maintenance_proc();
```

`premake = 3`: при запуске maintenance в конце апреля — партиции за май, июнь, июль уже созданы. Новые строки никогда не попадают в `audit_log_default` при штатной работе.

## Health-check эндпоинт

Operational hygiene: мониторинг состояния партиций через API:

```typescript
// admin.controller.ts — GET /admin/health/audit-log
async auditLogHealth(): Promise<AuditLogHealthDto> {
  const [defaultCount, lastMaintenance, upcomingPartitions] = await Promise.all([
    // 1. Строки в дефолтной партиции — должно быть 0
    this.prisma.$queryRaw<[{ count: number }]>`
      SELECT COUNT(*) AS count FROM audit_log_default
    `,

    // 2. Последний запуск maintenance
    this.prisma.$queryRaw<[{ last_run: Date }]>`
      SELECT last_run FROM partman.part_config
      WHERE parent_table = 'public.audit_log'
    `,

    // 3. Существующие партиции на следующие 3 месяца
    this.prisma.$queryRaw<{ partition_name: string }[]>`
      SELECT tablename AS partition_name
      FROM pg_tables
      WHERE tablename LIKE 'audit_log_%'
        AND tablename > 'audit_log_' || to_char(NOW(), 'YYYY_MM')
      ORDER BY tablename
      LIMIT 3
    `,
  ]);

  const defaultRowCount = Number(defaultCount[0].count);
  const hasUpcomingPartitions = upcomingPartitions.length >= 2;

  return {
    defaultPartitionRowCount: defaultRowCount,
    isHealthy: defaultRowCount === 0 && hasUpcomingPartitions,
    lastMaintenanceRun: lastMaintenance[0]?.last_run,
    upcomingPartitions: upcomingPartitions.map(p => p.partition_name),
    alerts: [
      ...(defaultRowCount > 0 ? [`CRITICAL: ${defaultRowCount} rows in audit_log_default — pg_partman maintenance required`] : []),
      ...(!hasUpcomingPartitions ? ['WARNING: less than 2 future partitions exist — run pg_partman maintenance'] : []),
    ],
  };
}
```

Алерт: `defaultPartitionRowCount > 0` → немедленное внимание DBA. Добавить в мониторинг наравне с disk usage.

## Архивация холодных партиций

Партиции старше 12 месяцев переносятся в архивный tablespace:

```sql
-- DBA-операция, выполняется ежеквартально в окно обслуживания (суббота ночь)
-- Занимает AccessExclusiveLock на партицию на время физического копирования (~5-30 мин для большой партиции)
-- Данные остаются доступны для чтения на archive_ts
ALTER TABLE audit_log_2025_01 SET TABLESPACE archive_ts;
```

Операция документируется в runbook с временным окном; ненулевое время блокировки — допустимо в обслуживание.

## Мониторинг дефолтной партиции

```sql
-- Alert: если дефолтная партиция растёт — pg_partman не создал партицию вовремя
SELECT COUNT(*) FROM audit_log_default;
-- Порог алерта: > 0 строк — немедленное внимание DBA
```

Ненулевой размер `audit_log_default` означает, что строки записались вне ожидаемых партиций.

## Инварианты

- `audit_log`: только INSERT в `AuditLogService` — DELETE и UPDATE запрещены на уровне приложения (ADR-007) и через `REVOKE UPDATE, DELETE ON audit_log FROM ccip_app` (P-25).
- Партиции создаются `pg_partman` с `premake=3` — новые строки никогда не должны попадать в `audit_log_default`.
- Алерт на ненулевой `audit_log_default` — операционное требование, не опциональное. Проверяется через `/admin/health/audit-log`.
- Архивный tablespace применяется к партициям старше 12 месяцев в окно обслуживания.
- Индекс `idx_audit_log_record` — обязателен.
- Composite PK `(id, performed_at)` — корректная форма для partitioned tables (применяется при создании таблицы).

## Производительность запросов

Типовой запрос истории объекта: `WHERE table_name = 'period_facts' AND record_id = :id`.

При отсутствии `performed_at` — index scan по `idx_audit_log_record` на каждой партиции. Для 5-летней истории (~60 партиций × несколько строк) — приемлемо.

Для запросов с фильтром по времени: `AND performed_at > NOW() - INTERVAL '3 months'` даёт partition pruning до 3 партиций.
