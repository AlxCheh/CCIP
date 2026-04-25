# ADR-006 — BoQ Versioning: work_lineage_id и кросс-версионная агрегация

**Статус:** Принято (rev 2 — 2026-04-25)  
**Дата:** 2026-04-25  
**Риск:** R-06

## Проблема

При обновлении BoQ (UpdateBaseline, смена состава работ) создаётся новая версия `boq_versions`. Позиции новой версии получают **новые** `boq_items.id`. `period_facts` ссылаются на конкретный `boq_item_id` — при смене версии fact-записи старых периодов остаются на старом item_id.

Следствие: простой запрос `SUM(period_facts.accepted_volume) WHERE boq_item_id = :id` возвращает факт **только по одной версии BoQ**. Накопленная история (`cumulative_fact`, `pct_ready`) ломается.

Дополнительная проблема (rev 2): **split/merge позиций** при UpdateBaseline.

- **Split**: позиция «бетон фундамент» (plan=500) делится на «бетон Сектор-1» (plan=300) и «бетон Сектор-2» (plan=200). Скалярный `work_lineage_id` может унаследоваться только к одной наследнице — другая теряет исторический факт.
- **Merge**: «арматура зона-А» + «арматура зона-Б» объединяются в «арматура плиты». Оба lineage_id нужно привязать к одной новой позиции.

## Альтернативы (базовый линейдж)

| Подход | Проблема |
|--------|---------|
| Name-based matching | Имена позиций могут редактироваться; не является стабильным ключом |
| Отдельная таблица `work_lineage` | Лишний JOIN; сложность поддержки |
| Рекурсивный CTE по `predecessor_item_id` | O(n) по глубине версий; не поддерживает split/merge |
| **`work_lineage_id` UUID + `boq_item_lineage_links` (принято)** | Стабильный первичный lineage + таблица связей для split/merge |

## Решение

**Двухуровневая модель lineage:**

1. `boq_items.work_lineage_id` — первичный стабильный идентификатор (сохраняется для простого rename, backward-compatible).
2. `boq_item_lineage_links(source_item_id, lineage_id, weight)` — расширенные связи для split/merge.

```
RENAME:
  v1.0: item A (lineage_id=L1, plan=500)
  v1.1: item B (lineage_id=L1, plan=500)   ← наследует L1 напрямую через work_lineage_id
  boq_item_lineage_links: пуста (не нужна)

SPLIT:
  v1.0: item A (lineage_id=L1, plan=500)
  v1.1: item B (lineage_id=L1, plan=300)   ← основной наследник, L1 в work_lineage_id
         item C (lineage_id=L_new, plan=200)
  boq_item_lineage_links:
    (C, L1, 0.40)    ← C участвует в L1 с весом 0.40 (200/500)
    (B, L1, 0.60)    ← B дополнительно регистрируется с весом 0.60 (опционально)

MERGE:
  v1.0: item A (lineage_id=L1, plan=300)
         item D (lineage_id=L2, plan=200)
  v1.1: item E (lineage_id=L1, plan=500)   ← основной lineage
  boq_item_lineage_links:
    (E, L2, 1.0)     ← E также агрегирует исторический факт по L2
```

## Контракт схемы

```sql
-- Уже присутствует в schema.sql
-- boq_items.work_lineage_id UUID NOT NULL
-- boq_items.predecessor_item_id UUID REFERENCES boq_items(id)
-- INDEX idx_boq_items_lineage ON boq_items(work_lineage_id)

-- P-22 (schema.sql) — расширение для split/merge
CREATE TABLE boq_item_lineage_links (
    source_item_id  UUID          NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
    lineage_id      UUID          NOT NULL,
    weight          DECIMAL(6,5)  NOT NULL DEFAULT 1.0
                        CHECK (weight > 0 AND weight <= 1),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (source_item_id, lineage_id)
);

CREATE INDEX idx_lineage_links_lineage ON boq_item_lineage_links(lineage_id);
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
    await tx.boqVersions.updateMany({
      where: { objectId, isActive: true },
      data: { isActive: false },
    });

    const newVersion = await tx.boqVersions.create({
      data: { objectId, changeType, isActive: true },
    });

    for (const draft of items) {
      const predecessor = draft.predecessorItemId
        ? await tx.boqItems.findUniqueOrThrow({ where: { id: draft.predecessorItemId } })
        : null;

      const newItem = await tx.boqItems.create({
        data: {
          ...draft,
          boqVersionId: newVersion.id,
          workLineageId: predecessor?.workLineageId ?? randomUUID(),
          predecessorItemId: draft.predecessorItemId ?? null,
        },
      });

      // SPLIT / MERGE: если указаны дополнительные lineage_id для этой позиции
      if (draft.additionalLineageLinks?.length) {
        for (const link of draft.additionalLineageLinks) {
          await tx.boqItemLineageLinks.create({
            data: {
              sourceItemId: newItem.id,
              lineageId: link.lineageId,
              weight: link.weight,
            },
          });
        }
      }
    }

    return newVersion;
  });
}
```

## Контракт аналитического запроса

```typescript
// analytics.service.ts — суммарный факт по lineage_id через все версии BoQ
// Учитывает как work_lineage_id (прямой), так и boq_item_lineage_links (split/merge)
async getCumulativeFact(
  workLineageId: string,
  tx?: Prisma.TransactionClient,
): Promise<number> {
  const db = tx ?? this.prisma;
  const result = await db.$queryRaw<{ total: number }[]>`
    SELECT COALESCE(SUM(pf.accepted_volume), 0) AS total
    FROM period_facts pf
    JOIN boq_items bi ON bi.id = pf.boq_item_id
    WHERE bi.work_lineage_id = ${workLineageId}

    UNION ALL

    -- Дополнительные связи через boq_item_lineage_links (split/merge)
    -- Применяем вес: если C участвует в L1 с весом 0.4, берём 40% её факта
    SELECT COALESCE(SUM(pf2.accepted_volume * lnk.weight), 0) AS total
    FROM period_facts pf2
    JOIN boq_items bi2 ON bi2.id = pf2.boq_item_id
    JOIN boq_item_lineage_links lnk ON lnk.source_item_id = bi2.id
    WHERE lnk.lineage_id = ${workLineageId}
      AND bi2.work_lineage_id != ${workLineageId}  -- исключаем уже учтённые выше
  `;

  // Суммируем обе части
  return result.reduce((sum, row) => sum + Number(row.total), 0);
}
```

**Батч-версия** (используется в `calcReadiness` для избежания N+1):

```typescript
// analytics.service.ts — получение всех cumulative facts за один запрос
async getCumulativeFactsBatch(
  lineageIds: string[],
  tx?: Prisma.TransactionClient,
): Promise<Map<string, number>> {
  const db = tx ?? this.prisma;

  const directRows = await db.$queryRaw<{ lineage_id: string; total: number }[]>`
    SELECT bi.work_lineage_id AS lineage_id, COALESCE(SUM(pf.accepted_volume), 0) AS total
    FROM period_facts pf
    JOIN boq_items bi ON bi.id = pf.boq_item_id
    WHERE bi.work_lineage_id = ANY(${lineageIds}::uuid[])
    GROUP BY bi.work_lineage_id
  `;

  const linkRows = await db.$queryRaw<{ lineage_id: string; total: number }[]>`
    SELECT lnk.lineage_id, COALESCE(SUM(pf.accepted_volume * lnk.weight), 0) AS total
    FROM period_facts pf
    JOIN boq_items bi ON bi.id = pf.boq_item_id
    JOIN boq_item_lineage_links lnk ON lnk.source_item_id = bi.id
    WHERE lnk.lineage_id = ANY(${lineageIds}::uuid[])
      AND bi.work_lineage_id != lnk.lineage_id
    GROUP BY lnk.lineage_id
  `;

  const result = new Map<string, number>();
  for (const id of lineageIds) result.set(id, 0);
  for (const row of [...directRows, ...linkRows]) {
    result.set(row.lineage_id, (result.get(row.lineage_id) ?? 0) + Number(row.total));
  }
  return result;
}
```

## История периодов на карточке вида работ

Лента периодов фильтруется по `work_lineage_id`:

```typescript
const history = await prisma.periodFacts.findMany({
  where: { boqItem: { workLineageId: targetLineageId } },
  include: {
    period: { select: { periodNumber: true, status: true } },
    boqItem: { select: { boqVersion: { select: { versionNumber: true } } } },
  },
  orderBy: { period: { periodNumber: 'asc' } },
});
```

Для split/merge — дополнительно подгружаются факты через `boq_item_lineage_links`.

## Инварианты

- `work_lineage_id` никогда не меняется после создания позиции.
- При rename: `new_item.work_lineage_id = predecessor.work_lineage_id`. `boq_item_lineage_links` не создаётся.
- При split: основной наследник получает lineage через `work_lineage_id`; второстепенные — через `boq_item_lineage_links` с соответствующими весами.
- При merge: новая объединённая позиция получает один lineage через `work_lineage_id`; оставшиеся — через `boq_item_lineage_links` с весом `1.0`.
- `SUM(weight) по всем позициям-участницах одного lineage_id` не обязательно равна 1.0 — вес отражает долю участия, не нормировочный коэффициент.
- Любой аналитический запрос по накопленному факту использует `getCumulativeFact(workLineageId)`, а не прямой JOIN через `boq_item_id`.
- `idx_boq_items_lineage` и `idx_lineage_links_lineage` обязательны.

## Коллизии lineage_id

UUID v4 (122 бит энтропии). При 10 000 позиций вероятность коллизии ≈ 10^-29. Практически невозможна.
