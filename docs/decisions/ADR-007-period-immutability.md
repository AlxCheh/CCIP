# ADR-007 — Неизменность закрытых периодов и целостность Audit Log

**Статус:** Принято (rev 2 — 2026-04-25)  
**Дата:** 2026-04-25  
**Риск:** R-07

## Проблема

Закрытый период содержит **верифицированный факт** — единственное доказательство выполнения работ от независимого строительного контроля. Физическое изменение этих данных после закрытия периода подрывает бизнес-ценность системы.

Два конкурирующих требования:
1. Исторические данные должны быть неизменны (аудит, юридическая значимость).
2. Технические ошибки ввода случаются — корректировка должна быть возможна (только для Admin).

## Решение

**Запрет на уровне приложения + Admin-correction flow с обязательной записью в `audit_log` + каскадный пересчёт snapshots + DB-уровень backstop.**

## Правило неизменности (enforcement)

```typescript
// period.service.ts — вызывается перед любым UPDATE на period_facts
private async assertPeriodEditable(periodId: string, tx: Prisma.TransactionClient): Promise<void> {
  const period = await tx.periods.findUniqueOrThrow({ where: { id: periodId } });
  if (period.status === 'closed' || period.status === 'force_closed') {
    throw new ForbiddenException('PERIOD_ALREADY_CLOSED');
  }
}
```

Это правило применяется **во всех** методах, изменяющих `period_facts`:
- `submitFact()` — SC вводит sc_volume
- `setDiscrepancy()` — SC выставляет флаг Тип 2
- `resolveConflict()` — резолюция офлайн-конфликта (ADR-003)

`stroycontrol` и `director` не могут обойти это правило — RBAC Guard (ADR-009) проверяет роль до вызова метода.

## DB-уровень backstop (P-25)

App-level проверка может быть обойдена при прямом доступе к БД или в будущих сервисах. Второй слой защиты — Postgres permissions:

```sql
-- P-25 (schema.sql)
-- Роль приложения не может UPDATE/DELETE period_facts напрямую.
-- Только через функцию fn_admin_correct_fact, которая SET SESSION ccip.admin_mode = 'true'.
REVOKE UPDATE, DELETE ON period_facts FROM ccip_app;
REVOKE UPDATE, DELETE ON audit_log    FROM ccip_app;

-- Функция-обёртка для admin-correction (вызывается только из adminCorrectFact транзакции)
CREATE OR REPLACE FUNCTION fn_admin_correct_fact(
    p_fact_id      UUID,
    p_sc_volume    NUMERIC,
    p_accepted     NUMERIC,
    p_admin_id     INTEGER,
    p_reason       TEXT
) RETURNS VOID SECURITY DEFINER LANGUAGE plpgsql AS $$
BEGIN
  -- SECURITY DEFINER: функция выполняется с правами владельца (суперпользователь),
  -- а не вызывающей роли ccip_app. Это единственный способ UPDATE period_facts.
  UPDATE period_facts
  SET sc_volume = p_sc_volume, accepted_volume = p_accepted
  WHERE id = p_fact_id;

  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, reason, performed_by)
  SELECT 'period_facts', p_fact_id, 'admin_correction',
         to_jsonb(pf.*), jsonb_build_object('sc_volume', p_sc_volume, 'accepted_volume', p_accepted),
         p_reason, p_admin_id
  FROM period_facts pf WHERE id = p_fact_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_admin_correct_fact TO ccip_app;
```

## Admin Correction Flow

```typescript
// period.service.ts
async adminCorrectFact(
  factId: string,
  correction: AdminCorrectionDto, // { newScVolume: number; reason: string }
  adminId: string,
): Promise<void> {
  let periodId: string;

  await this.prisma.$transaction(async (tx) => {
    const fact = await tx.periodFacts.findUniqueOrThrow({
      where: { id: factId },
      include: { period: true },
    });
    periodId = fact.period.id;

    // Единственный способ изменить period_facts — через SECURITY DEFINER функцию
    await tx.$executeRaw`
      SELECT fn_admin_correct_fact(
        ${factId}::uuid,
        ${correction.newScVolume}::numeric,
        ${correction.newScVolume}::numeric,
        ${adminId}::integer,
        ${correction.reason}
      )
    `;
  });

  // Каскадный пересчёт: корректировка периода N делает недостоверными снимки N, N+1, ..., current
  await this.analyticsService.recalcSnapshotCascade(periodId!);
}
```

## Каскадный пересчёт snapshots (критично)

`cumulative_fact` агрегирует факты через **все** периоды. Корректировка периода N влияет на снимки N, N+1, ..., текущего. Без каскадного пересчёта дашборд директора показывает неконсистентные данные.

```typescript
// analytics.service.ts
async recalcSnapshotCascade(fromPeriodId: string): Promise<void> {
  // Получаем все периоды того же объекта, начиная с fromPeriodId, в хронологическом порядке
  const fromPeriod = await this.prisma.periods.findUniqueOrThrow({
    where: { id: fromPeriodId },
    select: { objectId: true, periodNumber: true },
  });

  const periodsToRecalc = await this.prisma.periods.findMany({
    where: {
      objectId: fromPeriod.objectId,
      periodNumber: { gte: fromPeriod.periodNumber },
      status: { in: ['closed', 'force_closed'] },
    },
    orderBy: { periodNumber: 'asc' },
  });

  for (const period of periodsToRecalc) {
    // Пересчёт каждого снимка в отдельной транзакции
    // (нельзя в одной — каждый snalcReadiness читает обновлённый work_pace предыдущего)
    await this.prisma.$transaction(async (tx) => {
      // Удаляем устаревший снимок
      await tx.readinessSnapshots.deleteMany({ where: { periodId: period.id } });
      // Пересоздаём
      await this.calcReadiness(period.id, tx);
    });

    this.logger.log(`Cascade recalc: period ${period.periodNumber} (${period.id}) done`);
  }

  // Один REFRESH MV после всех пересчётов
  await this.refreshDashboard(fromPeriodId);
}
```

При 50 периодах × <1 сек/период = <50 сек общего времени. Выполняется асинхронно после Admin-корректировки (не блокирует HTTP-ответ).

## Append-only Audit Log

`audit_log` — абсолютно append-only. Ни одна роль, включая `admin`, не должна иметь возможности DELETE или UPDATE записей.

Обеспечивается двойным барьером:
1. App-level: `AuditLogService` предоставляет только `create()`.
2. DB-level: `REVOKE UPDATE, DELETE ON audit_log FROM ccip_app` (P-25).

```typescript
// audit-log.service.ts — единственная точка записи
async record(entry: CreateAuditLogDto): Promise<void> {
  await this.prisma.auditLog.create({ data: entry });
  // Нет методов update() или delete()
}
```

## Партиционирование Audit Log

Отдельный ADR-010 описывает стратегию партиционирования. Здесь фиксируется только: партиции не влияют на семантику append-only — данные в любой партиции защищены тем же правилом.

## Инварианты

- `period.status IN ('closed', 'force_closed')` → запись `period_facts` изменяется только Admin-ом через `adminCorrectFact()`.
- Каждая Admin-корректировка обязана создавать запись `audit_log` с `action='admin_correction'` — обеспечивается `fn_admin_correct_fact` (SECURITY DEFINER, атомарно).
- После Admin-корректировки **все последующие** периоды того же объекта пересчитываются через `recalcSnapshotCascade()`.
- `audit_log`: только INSERT — `REVOKE UPDATE, DELETE` на уровне БД для роли `ccip_app`.
- `period_facts`: `REVOKE UPDATE, DELETE` для `ccip_app`; изменение только через `fn_admin_correct_fact`.

## Что НЕ является нарушением неизменности

| Действие | Разрешено | Обоснование |
|---------|-----------|-------------|
| Чтение закрытого периода | ✓ | Read-only всегда |
| Добавление записи в `audit_log` | ✓ | Append-only, не модификация |
| Изменение `periods.status` SLA-шедулером | ✓ | Статус периода ≠ исторические данные факта |
| Admin-корректировка `period_facts` | ✓ (с audit_log + cascade) | Технические ошибки; след остаётся; аналитика пересчитана |
| SC изменяет `period_facts` закрытого периода | ✗ | `PERIOD_ALREADY_CLOSED` |
| Director изменяет `period_facts` | ✗ | Director — read-only по RBAC |
| Удаление записей `audit_log` | ✗ | Никогда, даже Admin; REVOKE на уровне БД |
