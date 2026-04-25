# ADR-003 — Офлайн-конфликты: два SC на одной позиции

**Статус:** Принято  
**Дата:** 2026-04-24  
**Риск:** R-03

## Проблема

SC-A офлайн вводит `sc_volume = 80` для позиции W3/P5. SC-B онлайн вводит `sc_volume = 75` на ту же позицию. При восстановлении сети SC-A отправляет `/sync` — данные расходятся. `last-write-wins` запрещён архитектурой.

## Решение

**Детекция через version counter + ручная резолюция SC с обязательным примечанием.**

`client_timestamp` для детекции конфликтов **не используется** — часы мобильного устройства могут отставать или опережать серверное время (clock skew), что позволяет пропустить конфликт или ложно его создать.

## Патч схемы БД

В таблицу `period_facts` добавляется колонка версионного счётчика:

```sql
ALTER TABLE period_facts ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

-- Триггер инкрементирует version при каждом UPDATE sc_volume
CREATE OR REPLACE FUNCTION trg_period_facts_bump_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_period_facts_version
  BEFORE UPDATE OF sc_volume ON period_facts
  FOR EACH ROW EXECUTE FUNCTION trg_period_facts_bump_version();
```

При синхронизации устройство передаёт `last_known_version` — версию, которую оно получило с сервера при последнем успешном `/sync`.

## Контракт детекции конфликта

```
sync_queue.last_known_version  vs  period_facts.version

Если period_facts.version != last_known_version → конфликт:
  sync_queue.status = 'conflict'
  sync_queue.conflict_data = {
    server: { value, engineer, at, version },
    device: { value, engineer, at, last_known_version }
  }

Иначе → применить (идемпотентный повтор или первичная запись)
         UPDATE period_facts SET sc_volume = :value, version = version + 1
```

Это полностью устраняет clock skew: сравниваются версии, а не абсолютные метки времени.

## Контракт резолюции

`POST /sync/resolve`
- `syncQueueId` — ссылка на запись конфликта
- `chosenValue` — выбранный объём
- `note` — примечание SC (обязательно, `@IsNotEmpty`)

```typescript
// sync.service.ts
async resolveConflict(dto: ResolveConflictDto, actorId: string): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    const entry = await tx.syncQueue.findUniqueOrThrow({
      where: { id: dto.syncQueueId, status: 'conflict' },
    });

    // Перечитываем актуальное значение из БД — conflict_data.server могло устареть
    const current = await tx.periodFacts.findUniqueOrThrow({
      where: { id: entry.factId },
      select: { scVolume: true, version: true, periodId: true },
    });

    // Период должен быть открыт
    const period = await tx.periods.findUniqueOrThrow({
      where: { id: current.periodId },
    });
    if (period.status !== 'open') {
      throw new ConflictException('PERIOD_ALREADY_CLOSED');
    }

    await tx.periodFacts.update({
      where: { id: entry.factId },
      data: { scVolume: dto.chosenValue },
      // version инкрементируется триггером автоматически
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
        oldData: entry.conflictData,   // обе версии — device и server snapshot
        newData: { chosenValue: dto.chosenValue, resolvedBy: actorId },
        reason: dto.note,
        performedBy: actorId,
        performedAt: new Date(),
      },
    });
  });
}
```

## Инварианты

- `note` обязателен — валидация на уровне DTO, не на уровне БД
- Резолюция возможна только пока `period.status = 'open'`
- При резолюции серверное значение перечитывается из БД, не берётся из `conflict_data` (может устареть)
- `audit_log` содержит полный snapshot обеих версий и имя SC, принявшего решение
- `last-write-wins` явно запрещён: синхронизатор никогда не применяет данные без проверки `version`

## Three-way conflict

Если между офлайн-сессией SC-A и его синхронизацией позицию изменили последовательно SC-B (75) и SC-C (70):

- `period_facts.version` = 3 (два изменения после базовой записи)
- `sync_queue.last_known_version` = 1 (SC-A знал только исходное значение)
- `1 != 3` → конфликт детектируется

`conflict_data` фиксирует текущее серверное состояние (значение SC-C), а в `audit_log` сохранена полная история изменений через записи SC-B и SC-C. SC-A видит актуальное серверное значение и принимает решение осознанно.

## UI-контракт (Mobile)

Карточка конфликта показывает:
- Device-версию: значение SC-A с временем ввода
- **Актуальное** серверное значение (перечитанное в момент открытия карточки, не из `conflict_data.server`)
- Имя последнего инженера, изменившего серверную версию

SC обязан выбрать одну версию и написать примечание перед отправкой.

## Патч sync_queue

```sql
-- Заменить поле client_timestamp как основание детекции на last_known_version
ALTER TABLE sync_queue ADD COLUMN last_known_version INTEGER;

-- client_timestamp сохраняется для аудита и отображения в UI, но не для детекции
```
