# ADR-010 — Audit Log: партиционирование и append-only гарантии

**Статус:** Принято  
**Дата:** 2026-04-25  
**Риск:** R-10

## Проблема

`audit_log` растёт неограниченно: каждая запись SC, каждая Admin-корректировка, каждый resolved конфликт создаёт строку. Без партиционирования:
- Таблица деградирует по скорости INSERT при миллионах строк.
- Запрос `WHERE record_id = :id` без partition pruning выполняет full scan.
- Архивация старых записей требует `DELETE` по всей таблице — долгая блокирующая операция.

Дополнительный риск: если партиции не создаются заранее, PostgreSQL помещает новые строки в `audit_log_default`. При достаточном объёме это становится узким местом, и детач дефолтной партиции требует полного сканирования (нет partition constraint).

## Решение

**Ежемесячные RANGE-партиции по `performed_at` + `pg_partman` для автосоздания + индекс `(table_name, record_id)` на каждой партиции.**

## Контракт схемы

```sql
-- Уже присутствует в schema.sql (P-15)
CREATE TABLE audit_log (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name     VARCHAR(100) NOT NULL,
    record_id      UUID         NOT NULL,
    action         VARCHAR(50)  NOT NULL,
    old_data       JSONB,
    new_data       JSONB,
    reason         TEXT,
    performed_by   UUID         REFERENCES users(id),
    performed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (performed_at);

-- Явные партиции на ближайшие периоды
CREATE TABLE audit_log_2026_04 PARTITION OF audit_log
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE audit_log_2026_05 PARTITION OF audit_log
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- Дефолтная партиция — предохранитель, не основное хранилище
CREATE TABLE audit_log_default PARTITION OF audit_log DEFAULT;

-- Индекс на каждой партиции (создаётся автоматически через PARTITION OF)
-- Запрос по record_id: partition pruning по performed_at + index scan по (table_name, record_id)
CREATE INDEX idx_audit_log_record ON audit_log (table_name, record_id);
```

## pg_partman — автосоздание партиций

```sql
-- Предварительное требование: расширение pg_partman установлено
SELECT partman.create_parent(
    p_parent_table := 'public.audit_log',
    p_control      := 'performed_at',
    p_type         := 'range',
    p_interval     := 'monthly',
    p_premake      := 3     -- создаёт следующие 3 месяца заранее
);

-- Запуск по расписанию (cron или pg_cron):
CALL partman.run_maintenance_proc();
```

`premake = 3`: при запуске maintenance в конце апреля — партиции за май, июнь, июль уже созданы. Новые строки никогда не попадают в `audit_log_default` при штатной работе.

## Архивация холодных партиций

Партиции старше 12 месяцев переносятся в архивный tablespace (холодное хранилище, более дешёвые диски):

```sql
-- DBA-операция, выполняется ежеквартально
ALTER TABLE audit_log_2025_01 SET TABLESPACE archive_ts;
```

Partition detach не требуется — данные остаются доступны для read, но физически на другом носителе.

## Мониторинг дефолтной партиции

```sql
-- Alert: если дефолтная партиция растёт — значит pg_partman не создал партицию вовремя
SELECT COUNT(*) FROM audit_log_default;
-- Порог алерта: > 0 строк — немедленное внимание DBA
```

Ненулевой размер `audit_log_default` означает, что строки записались вне ожидаемых партиций (сдвиг времени сервера, ошибка partman, `performed_at` в будущем/прошлом).

## Почему ежемесячные партиции (не еженедельные, не квартальные)

| Гранулярность | Проблема |
|--------------|---------|
| Еженедельные | При 5-летней истории — 260+ партиций; overhead планировщика PostgreSQL |
| Квартальные | Partition pruning менее эффективен для запросов по `record_id` в текущем квартале |
| **Ежемесячные** | Баланс: ~60 партиций за 5 лет; достаточная гранулярность для архивации; pg_partman поддерживает `monthly` нативно |

## Производительность запросов

Типовой запрос истории объекта: `WHERE table_name = 'period_facts' AND record_id = :id`.

При отсутствии ограничения по `performed_at` — PostgreSQL сканирует все партиции (`audit_log_YYYY_MM`). Индекс `(table_name, record_id)` на каждой партиции даёт index scan, не full scan. Для объекта с 5-летней историей это ~60 index scan × несколько строк = приемлемо.

Если нужна история за последние N периодов — добавить `AND performed_at > NOW() - INTERVAL '3 months'` для partition pruning до 3 партиций.

## Инварианты

- `audit_log`: только INSERT в `AuditLogService` — DELETE и UPDATE запрещены на уровне приложения (ADR-007).
- Партиции создаются `pg_partman` с `premake=3` — новые строки никогда не должны попадать в `audit_log_default`.
- Алерт на ненулевой `audit_log_default` — операционное требование, не опциональное.
- Архивный tablespace применяется к партициям старше 12 месяцев — данные остаются доступны для чтения.
- Индекс `idx_audit_log_record` — обязателен; без него история объекта = full scan всех партиций.
