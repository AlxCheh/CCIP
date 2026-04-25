# ADR-003 — Офлайн-конфликты: два SC на одной позиции

**Статус:** Принято (rev 2 — 2026-04-25)  
**Дата:** 2026-04-24  
**Риск:** R-03

## Проблема

SC-A офлайн вводит `sc_volume = 80` для позиции W3/P5. SC-B онлайн вводит `sc_volume = 75` на ту же позицию. При восстановлении сети SC-A отправляет `/sync` — данные расходятся. `last-write-wins` запрещён архитектурой.

## Решение

**Детекция через version counter на всех офлайн-редактируемых полях + ручная резолюция SC с обязательным примечанием + явный workflow для конфликта в закрытом периоде.**

`client_timestamp` для детекции конфликтов **не используется** — часы мобильного устройства могут отставать или опережать серверное время (clock skew).

## Патч схемы БД (P-19, P-23)

```sql
-- P-19 (уже применён): version counter
ALTER TABLE period_facts ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

-- P-23 (rev 2): триггер расширен на ВСЕ офлайн-редактируемые поля
-- (sc_volume, discrepancy_type, note — всё что SC может изменить офлайн)
CREATE OR REPLACE FUNCTION fn_period_facts_bump_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- Инкрементируем если изменилось хотя бы одно из офлайн-полей
    IF (NEW.sc_volume       IS DISTINCT FROM OLD.sc_volume) OR
       (NEW.discrepancy_type IS DISTINCT FROM OLD.discrepancy_type) OR
       (NEW.note             IS DISTINCT FROM OLD.note)
    THEN
        NEW.version := OLD.version + 1;
    END IF;
    RETURN NEW;
END;
$$;

-- Пересоздаём триггер с расширенным условием (OF sc_volume → без OF — ANY column UPDATE)
DROP TRIGGER IF EXISTS trg_period_facts_bump_version ON period_facts;

CREATE TRIGGER trg_period_facts_bump_version
    BEFORE UPDATE ON period_facts
    FOR EACH ROW EXECUTE FUNCTION fn_period_facts_bump_version();

-- sync_queue: уже содержит last_known_version (P-19)
-- ALTER TABLE sync_queue ADD COLUMN last_known_version INTEGER;
```

При синхронизации устройство передаёт `last_known_version` — версию, которую оно получило с сервера при последнем успешном `/sync`.

## Контракт детекции конфликта

```
sync_queue.last_known_version  vs  period_facts.version

Если period_facts.version != last_known_version → конфликт:
  sync_queue.status = 'conflict'
  sync_queue.conflict_data = {
    server: { sc_volume, discrepancy_type, note, engineer, at, version },
    device: { sc_volume, discrepancy_type, note, engineer, at, last_known_version }
  }

Иначе → применить (идемпотентный повтор или первичная запись)
         UPDATE period_facts SET ..., version = version + 1 (через триггер)
```

## Контракт резолюции (открытый период)

`POST /sync/resolve`
- `syncQueueId` — ссылка на запись конфликта
- `chosenValue` — выбранный объём
- `chosenNote` — итоговое примечание (если discrepancy_type выбирался офлайн)
- `note` — пояснение SC о причине выбора (обязательно, `@IsNotEmpty`)

```typescript
// sync.service.ts
async resolveConflict(dto: ResolveConflictDto, actorId: string): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    const entry = await tx.syncQueue.findUniqueOrThrow({
      where: { id: dto.syncQueueId, status: 'conflict' },
    });

    const current = await tx.periodFacts.findUniqueOrThrow({
      where: { id: entry.factId },
      select: { scVolume: true, version: true, periodId: true, discrepancyType: true, note: true },
    });

    const period = await tx.periods.findUniqueOrThrow({
      where: { id: current.periodId },
    });

    if (period.status !== 'open') {
      // Период закрыт — нельзя резолвить как обычный конфликт
      // Передаём в Admin-workflow (см. ниже)
      throw new ConflictException('PERIOD_ALREADY_CLOSED_ESCALATE');
    }

    await tx.periodFacts.update({
      where: { id: entry.factId },
      data: {
        scVolume: dto.chosenValue,
        note: dto.chosenNote ?? current.note,
        // version инкрементируется триггером автоматически
      },
    });

    await tx.syncQueue.update({
      where: { id: dto.syncQueueId },
      data: { status: 'applied', resolvedBy: actorId, resolvedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        tableName: 'period_facts',
        recordId: entry.factId,
        action: 'conflict_resolved',
        oldData: entry.conflictData,
        newData: { chosenValue: dto.chosenValue, resolvedBy: actorId },
        reason: dto.note,
        performedBy: actorId,
        performedAt: new Date(),
      },
    });
  });
}
```

## Workflow: конфликт в закрытом периоде

Если SC-A пытается резолвить конфликт, а период уже закрыт (force_close SLA-таймером или явно SC-B):

1. Сервер возвращает `ConflictException('PERIOD_ALREADY_CLOSED_ESCALATE')`.
2. Мобильное приложение показывает: *«Период закрыт. Конфликт передан на рассмотрение администратора.»*
3. Создаётся запись в `discrepancies` (тип `offline_conflict_in_closed_period`):

```typescript
// sync.service.ts
async escalateConflictToAdmin(entry: SyncQueueEntry, actorId: string): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    // Создаём расхождение для Admin/Director review
    await tx.discrepancies.create({
      data: {
        periodId: entry.factId, // через period_facts → period
        boqItemId: entry.boqItemId,
        type: 'offline_conflict_in_closed_period',
        status: 'open',
        reportedBy: actorId,
        conflictData: entry.conflictData,
        description: `Офлайн-конфликт SC после закрытия периода. Device: ${entry.conflictData.device.scVolume}, Server: ${entry.conflictData.server.scVolume}`,
      },
    });

    await tx.syncQueue.update({
      where: { id: entry.id },
      data: { status: 'escalated' },
    });

    // Уведомление Admin
    await this.notificationsService.notifyAdmin({
      type: 'offline_conflict_escalated',
      message: `Конфликт офлайн-данных SC после закрытия периода — требует Admin-корректировки`,
    });
  });
}
```

Admin разрешает конфликт через `adminCorrectFact()` (ADR-007) с указанием выбранного значения и основания.

## Инварианты

- `note` о причине выбора обязателен — валидация на уровне DTO, не на уровне БД.
- Резолюция возможна только пока `period.status = 'open'`; иначе — эскалация в Admin.
- При резолюции серверное значение перечитывается из БД, не берётся из `conflict_data` (может устареть).
- `audit_log` содержит полный snapshot обеих версий и имя SC, принявшего решение.
- `last-write-wins` явно запрещён: синхронизатор никогда не применяет данные без проверки `version`.
- Триггер инкрементирует `version` при изменении **любого** офлайн-редактируемого поля: `sc_volume`, `discrepancy_type`, `note`.
- Эскалированный конфликт (`sync_queue.status='escalated'`) остаётся в истории устройства с пометкой «передано Admin».

## Three-way conflict

Если между офлайн-сессией SC-A и его синхронизацией позицию изменили последовательно SC-B (75) и SC-C (70):

- `period_facts.version` = 3 (два изменения после базовой записи)
- `sync_queue.last_known_version` = 1 (SC-A знал только исходное значение)
- `1 != 3` → конфликт детектируется

`conflict_data` фиксирует текущее серверное состояние (значение SC-C). SC-A видит актуальное серверное значение и принимает решение осознанно.

## UI-контракт (Mobile)

Карточка конфликта показывает:
- Device-версию: значение SC-A с временем ввода.
- **Актуальное** серверное значение (перечитанное в момент открытия карточки, не из `conflict_data.server`).
- Имя последнего инженера, изменившего серверную версию.
- Последние 3 записи `audit_log` по данному fact — для понимания контекста three-way conflict.

SC обязан выбрать одну версию и написать примечание перед отправкой.

При `status='escalated'`: карточка показывает статус «Передано администратору» без кнопок редактирования.
