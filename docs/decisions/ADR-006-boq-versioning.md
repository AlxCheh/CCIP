# ADR-006 — BoQ Versioning: work_lineage_id и кросс-версионная агрегация

**Статус:** Принято  
**Дата:** 2026-04-25  
**Риск:** R-06

## Проблема

При обновлении BoQ (UpdateBaseline, смена состава работ) создаётся новая версия `boq_versions`. Позиции новой версии получают **новые** `boq_items.id`. `period_facts` ссылаются на конкретный `boq_item_id` — при смене версии fact-записи старых периодов остаются на старом item_id.

Следствие: простой запрос `SUM(period_facts.accepted_volume) WHERE boq_item_id = :id` возвращает факт **только по одной версии BoQ**. Накопленная история (`cumulative_fact`, `pct_ready`) ломается.

## Альтернативы

| Подход | Проблема |
|--------|---------|
| Name-based matching | Имена позиций могут редактироваться; не является стабильным ключом |
| Отдельная таблица `work_lineage` | Лишний JOIN; сложность поддержки; не даёт преимуществ перед денормализацией |
| Рекурсивный CTE по `predecessor_item_id` | Работает, но O(n) по глубине версий; не индексируется напрямую |
| **`work_lineage_id` UUID (принято)** | Денормализованный стабильный идентификатор; прямой индекс → O(log n) |

## Решение

**`boq_items.work_lineage_id` (UUID)** — стабильный идентификатор позиции, не меняющийся при смене версии BoQ.

```
boq_versions v1.0 → boq_items(id=A, work_lineage_id=L1, plan_volume=100)
                                       ▲
                         predecessor_item_id
                                       │
boq_versions v1.1 → boq_items(id=B, work_lineage_id=L1, plan_volume=120)
```

- При создании позиции в новой версии из существующей: `new_item.work_lineage_id = predecessor.work_lineage_id`.
- При добавлении абсолютно новой позиции: `work_lineage_id = gen_random_uuid()`.
- `boq_items.id` — версия-специфичный первичный ключ (меняется между версиями).
- `boq_items.work_lineage_id` — бизнес-идентификатор (стабилен через все версии).

## Контракт схемы

```sql
-- Уже присутствует в schema.sql
-- boq_items.work_lineage_id UUID NOT NULL
-- boq_items.predecessor_item_id UUID REFERENCES boq_items(id)
-- INDEX idx_boq_items_lineage ON boq_items(work_lineage_id)
```

## Контракт сервиса (BoQ Versioning)

```typescript
// boq-versioning.service.ts
async createNewVersion(
  objectId: string,
  changeType: string,
  items: BoQItemDraft[],
): Promise<BoQVersion> {
  return this.prisma.$transaction(async (tx) => {
    // Деактивируем текущую версию
    await tx.boqVersions.updateMany({
      where: { objectId, isActive: true },
      data: { isActive: false },
    });

    const newVersion = await tx.boqVersions.create({
      data: { objectId, changeType, isActive: true, /* ... */ },
    });

    for (const draft of items) {
      const predecessor = draft.predecessorItemId
        ? await tx.boqItems.findUniqueOrThrow({ where: { id: draft.predecessorItemId } })
        : null;

      await tx.boqItems.create({
        data: {
          ...draft,
          boqVersionId: newVersion.id,
          // КРИТИЧНО: наследуем lineage_id от предшественника
          workLineageId: predecessor?.workLineageId ?? randomUUID(),
          predecessorItemId: draft.predecessorItemId ?? null,
        },
      });
    }

    return newVersion;
  });
}
```

## Контракт аналитического запроса

```typescript
// analytics.service.ts — суммарный факт по позиции через все версии BoQ
async getCumulativeFact(workLineageId: string): Promise<number> {
  const result = await this.prisma.$queryRaw<{ total: number }[]>`
    SELECT COALESCE(SUM(pf.accepted_volume), 0) AS total
    FROM period_facts pf
    JOIN boq_items bi ON bi.id = pf.boq_item_id
    WHERE bi.work_lineage_id = ${workLineageId}
  `;
  return result[0].total;
}

// pct_ready с учётом всех версий
async getPctReady(workLineageId: string, currentPlanVolume: number): Promise<number> {
  const cumulative = await this.getCumulativeFact(workLineageId);
  return Math.min((cumulative / currentPlanVolume) * 100, 100);
}
```

`currentPlanVolume` берётся из активной версии BoQ (`boq_items WHERE boq_version.is_active = TRUE`).

## История периодов на карточке вида работ

Лента периодов (§4.3 концепции) фильтруется по `work_lineage_id`, не по `boq_item_id`:

```typescript
// Все fact-записи по позиции через все версии BoQ
const history = await prisma.periodFacts.findMany({
  where: {
    boqItem: { workLineageId: targetLineageId },
  },
  include: {
    period: { select: { periodNumber: true, status: true } },
    boqItem: { select: { boqVersion: { select: { versionNumber: true } } } },
  },
  orderBy: { period: { periodNumber: 'asc' } },
});
// Каждая запись маркируется номером версии BoQ — визуально отображается в ленте
```

## Инварианты

- Новая версия `boq_items` **обязана** копировать `work_lineage_id` от предшественника — не от `boq_item.id`.
- `work_lineage_id` никогда не меняется после создания позиции.
- Абсолютно новые позиции (без предшественника) получают новый UUID.
- Любой аналитический запрос по накопленному факту использует `work_lineage_id`, не `boq_item_id`.
- `idx_boq_items_lineage` обязателен для O(log n) — без него кросс-версионный запрос становится full scan.

## Коллизии lineage_id

UUID v4 (122 бит энтропии). При 10 000 позиций на аккаунт вероятность коллизии ≈ 10^-29. Практически невозможна — дополнительных механизмов защиты не требуется.
