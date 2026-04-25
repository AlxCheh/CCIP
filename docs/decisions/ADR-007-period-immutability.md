# ADR-007 — Неизменность закрытых периодов и целостность Audit Log

**Статус:** Принято  
**Дата:** 2026-04-25  
**Риск:** R-07

## Проблема

Закрытый период содержит **верифицированный факт** — единственное доказательство выполнения работ от независимого строительного контроля. Физическое изменение этих данных после закрытия периода подрывает бизнес-ценность системы.

Два конкурирующих требования:
1. Исторические данные должны быть неизменны (аудит, юридическая значимость).
2. Технические ошибки ввода случаются — корректировка должна быть возможна (только для Admin).

## Решение

**Запрет на уровне приложения + Admin-correction flow с обязательной записью в `audit_log`.**

Базовый принцип: закрытый период **физически изменяется** только Admin-ом через явный корректирующий процесс. Каждая корректировка оставляет неизгладимый след в `audit_log` с полным snapshot обеих версий и обоснованием.

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

## Admin Correction Flow

```typescript
// period.service.ts
async adminCorrectFact(
  factId: string,
  correction: AdminCorrectionDto, // { newScVolume: number; reason: string }
  adminId: string,
): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    const fact = await tx.periodFacts.findUniqueOrThrow({
      where: { id: factId },
      include: { period: true },
    });

    // Admin может корректировать закрытые периоды, но обязан оставить след
    await tx.auditLog.create({
      data: {
        tableName: 'period_facts',
        recordId: factId,
        action: 'admin_correction',
        oldData: {
          scVolume: fact.scVolume,
          acceptedVolume: fact.acceptedVolume,
          periodStatus: fact.period.status,
        },
        newData: {
          scVolume: correction.newScVolume,
          acceptedVolume: correction.newScVolume,
        },
        reason: correction.reason,   // обязательно, @IsNotEmpty в DTO
        performedBy: adminId,
        performedAt: new Date(),
      },
    });

    await tx.periodFacts.update({
      where: { id: factId },
      data: {
        scVolume: correction.newScVolume,
        acceptedVolume: correction.newScVolume,
      },
    });
  });

  // Пересчёт аналитики после корректировки — снимок устарел
  await this.analyticsService.recalcSnapshot(fact.period.id);
}
```

`correction.reason` обязателен на уровне DTO (`@IsNotEmpty`), не на уровне БД — аналогично `note` в ADR-003.

## Append-only Audit Log

`audit_log` — абсолютно append-only. Ни одна роль, включая `admin`, не должна иметь возможности DELETE или UPDATE записей.

Обеспечивается на уровне приложения: `AuditLogService` предоставляет только `create()`. Прямой доступ к таблице через Prisma в других модулях запрещён (только через `AuditLogService`).

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
- Каждая Admin-корректировка обязана создавать запись `audit_log` с `action='admin_correction'` в той же транзакции — корректировка без записи невозможна технически.
- `audit_log`: только INSERT — никаких UPDATE/DELETE ни в одном сервисе.
- После Admin-корректировки `readiness_snapshots` пересчитывается немедленно — snapshot не остаётся с устаревшими данными.

## Что НЕ является нарушением неизменности

| Действие | Разрешено | Обоснование |
|---------|-----------|-------------|
| Чтение закрытого периода | ✓ | Read-only всегда |
| Добавление записи в `audit_log` | ✓ | Append-only, не модификация |
| Изменение `periods.status` SLA-шедулером | ✓ | Статус периода ≠ исторические данные факта |
| Admin-корректировка `period_facts` | ✓ (с audit_log) | Технические ошибки; след остаётся |
| SC изменяет `period_facts` закрытого периода | ✗ | `PERIOD_ALREADY_CLOSED` |
| Director изменяет `period_facts` | ✗ | Director — read-only по RBAC |
| Удаление записей `audit_log` | ✗ | Никогда, даже Admin |
