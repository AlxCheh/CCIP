# ADR-008 — WatermelonDB и граница offline/online операций

**Статус:** Принято (rev 2 — 2026-04-25)  
**Дата:** 2026-04-25  
**Риск:** R-08

## Проблема

SC работает на строительной площадке без стабильного интернета. Мобильное приложение должно функционировать офлайн: вводить объёмы, прикреплять фото, выставлять флаги расхождений. При восстановлении сети — синхронизировать накопленные действия с сервером.

Два риска без явного архитектурного решения:
1. Неверный выбор offline-хранилища → нет реактивных запросов или плохая производительность.
2. Нечёткая граница offline/online → SC пытается закрыть период офлайн → race condition на сервере.

## Альтернативы offline-хранилища

| Технология | Проблема |
|-----------|---------|
| AsyncStorage | Key-value only; нет реляционных запросов; нет реактивности |
| expo-sqlite (прямой) | Нет встроенной реактивности; sync-логику нужно писать с нуля |
| Realm | Проприетарные ограничения; другая модель запросов |
| **WatermelonDB (принято)** | Построен на SQLite; реактивные запросы через Observable; sync-протокол задокументирован |

## Решение

**WatermelonDB** — локальная SQLite база на устройстве SC. Все офлайн-действия пишутся в локальную `sync_queue`. При наличии сети — SyncManager отправляет накопленные записи на сервер через **два канала**: `/sync/operations` (данные) + `/sync/photos` (файлы).

## Граница offline/online (контракт)

### Доступно офлайн (ставится в sync_queue)

| Операция | Таблица | Почему можно офлайн |
|---------|---------|---------------------|
| `submit_fact` | `period_facts` (sc_volume) | Основная работа SC; конфликт обрабатывается при sync |
| `upload_photo` | `photos` | Загружается в S3 при восстановлении; payload содержит локальный URI |
| `add_discrepancy_note` | `period_facts` (discrepancy_type, note) | Флаг Тип 2 ставится офлайн; server проверит при sync |
| `open_period` | `periods` | Постановка в очередь; server применит с advisory lock |

### Только онлайн (не добавляется в sync_queue)

| Операция | Почему только онлайн |
|---------|---------------------|
| `close_period` | Требует `pg_advisory_xact_lock`; проверяет disputes; результат нужен директору мгновенно |
| `submit_gp_template` | Одноразовый GP token должен быть инвалидирован атомарно |
| `approve_zero_report` | Действие директора с юридическими последствиями |

Блокировка в UI: при отсутствии сети кнопки «Закрыть период», «Подтвердить 0-отчёт» → disabled с сообщением «Требует подключения».

## Двухканальный sync

Одиночный `POST /sync` с 60+ МБ фото неприемлем — таймауты на 3G/LTE.

```
Канал 1: POST /sync/operations   — JSON, только операции (<50 КБ типично)
Канал 2: POST /sync/photos/:id   — multipart, одно фото, resumable
```

```typescript
// sync-manager.ts (Mobile)
class SyncManager {
  async sync(): Promise<SyncResult> {
    // Шаг 1: синхронизируем все операции (кроме фото)
    const dataResult = await this.syncOperations();

    // Шаг 2: загружаем фото по одному, с прогрессом
    const photoResult = await this.syncPhotos();

    return {
      applied: dataResult.applied + photoResult.applied,
      conflicts: dataResult.conflicts,
    };
  }

  private async syncOperations(): Promise<{ applied: number; conflicts: number }> {
    const pending = await localDb.syncQueue
      .query(Q.where('status', 'pending'), Q.where('operation', Q.notEq('upload_photo')))
      .fetch();

    if (pending.length === 0) return { applied: 0, conflicts: 0 };

    const response = await api.post('/sync/operations', {
      entries: pending.map(entry => ({
        id: entry.id,
        operation: entry.operation,
        payload: entry.payload,
        lastKnownVersion: entry.lastKnownVersion,
        clientTimestamp: entry.clientTimestamp,
        boqVersionNumber: entry.boqVersionNumber,  // для BoQ version gating
      })),
    });

    await localDb.write(async () => {
      for (const result of response.results) {
        const entry = pending.find(e => e.id === result.id);
        await entry?.update(e => {
          e.status = result.status;
          if (result.conflictData) e.conflictData = result.conflictData;
          if (result.rejectedReason) e.rejectedReason = result.rejectedReason;
        });
      }
    });

    return {
      applied: response.results.filter(r => r.status === 'applied').length,
      conflicts: response.results.filter(r => r.status === 'conflict').length,
    };
  }

  private async syncPhotos(): Promise<{ applied: number }> {
    const pendingPhotos = await localDb.syncQueue
      .query(Q.where('status', 'pending'), Q.where('operation', 'upload_photo'))
      .fetch();

    let applied = 0;
    for (const photo of pendingPhotos) {
      try {
        // Resumable: сервер возвращает S3-URL после загрузки
        const s3Url = await api.uploadPhoto('/sync/photos', photo.payload.localUri, {
          onProgress: (pct) => this.emitProgress(photo.id, pct),
        });

        await localDb.write(async () => {
          await photo.update(p => {
            p.status = 'applied';
            p.payload = { ...p.payload, s3Url };
          });
        });
        applied++;
      } catch (err) {
        // Одно фото не блокирует остальные
        this.logger.warn(`Photo upload failed for ${photo.id}`, err);
      }
    }
    return { applied };
  }
}
```

## BoQ Version Gating

Если устройство SC офлайн использует BoQ v1.0, а сервер перешёл на v1.2 — операции с несуществующими позициями провалятся с непонятными ошибками.

Каждая запись в sync_queue хранит `boqVersionNumber`, актуальный на момент ввода:

```typescript
// При добавлении в sync_queue
const currentBoqVersion = await localDb.boqVersions
  .query(Q.where('is_active', true))
  .fetchOne();

await localDb.write(async () => {
  await localDb.syncQueue.create(entry => {
    entry.operation = 'submit_fact';
    entry.payload = { factId, scVolume };
    entry.boqVersionNumber = currentBoqVersion?.versionNumber ?? '1.0';
    entry.lastKnownVersion = currentServerVersion;
    entry.status = 'pending';
  });
});
```

Сервер проверяет совместимость:

```typescript
// sync.service.ts — POST /sync/operations
for (const entry of dto.entries) {
  if (entry.operation === 'submit_fact' || entry.operation === 'add_discrepancy_note') {
    const currentBoqVersion = await this.getActiveBoqVersion(objectId);

    if (entry.boqVersionNumber !== currentBoqVersion.versionNumber) {
      // BoQ обновился — операция может ссылаться на несуществующую позицию
      results.push({
        id: entry.id,
        status: 'rejected',
        rejectedReason: 'BOQ_VERSION_MISMATCH',
        serverBoqVersion: currentBoqVersion.versionNumber,
      });
      continue;
    }
    // ... обычная обработка
  }
}
```

При `BOQ_VERSION_MISMATCH` мобильное приложение показывает: *«BoQ объекта обновлён до v1.2. Обновите список работ и повторите ввод.»*

## Bulk Resolve конфликтов

При массовой офлайн-сессии SC-A может получить 30+ конфликтов. UI предоставляет батч-операции:

```typescript
// POST /sync/resolve-bulk
async resolveBulk(dto: BulkResolveDto, actorId: string): Promise<void> {
  // dto.strategy = 'all_device' | 'all_server' | 'individual'
  for (const item of dto.items) {
    await this.resolveConflict({
      syncQueueId: item.syncQueueId,
      chosenValue: item.chosenValue,
      note: dto.globalNote ?? item.note,
    }, actorId);
  }
}
```

UI: checkbox «Принять все мои значения» / «Принять все серверные» + обязательное общее примечание для батч-резолюции.

## open_period в офлайн-режиме

`open_period` ставится в `sync_queue` как обычная операция. Идемпотентность обеспечивается проверкой при добавлении: если в локальной очереди уже есть pending `open_period` для того же `object_id` — новая запись заменяет старую (не создаёт дубль).

```typescript
// При нажатии «Открыть период» офлайн
const existing = await localDb.syncQueue
  .query(Q.where('operation', 'open_period'), Q.where('object_id', objectId), Q.where('status', 'pending'))
  .fetchOne();

if (existing) {
  // Обновляем существующую запись — не создаём дубль
  await localDb.write(async () => await existing.update(e => e.clientTimestamp = Date.now()));
} else {
  await localDb.write(async () => await localDb.syncQueue.create(/* ... */));
}
```

При sync сервер применяет advisory lock (ADR-002). Возможные результаты:
- `applied` — период открыт.
- `rejected` — уже существует открытый период; SC видит уведомление.

## Reconciliation после рестарта приложения

Если приложение было убито в момент sync (50% applied, 50% pending), при рестарте:

```typescript
// App startup — SyncManager.init()
async init(): Promise<void> {
  // Все 'pending' записи с is_syncing=true были прерваны — сбрасываем флаг
  await localDb.write(async () => {
    const stuckEntries = await localDb.syncQueue
      .query(Q.where('is_syncing', true))
      .fetch();

    for (const entry of stuckEntries) {
      await entry.update(e => e.isSyncing = false);
    }
  });

  // Запускаем обычный sync — идемпотентно, уже applied записи не пересылаются
  await this.sync();
}
```

`is_syncing` флаг (boolean) выставляется в `true` перед отправкой и в `false` после — служит маркером прерванного sync.

## Инварианты

- Только онлайн-операции (`close_period`, `approve_zero_report`, `submit_gp_template`) блокируются в UI без сети.
- Все офлайн-операции сериализуются в `sync_queue` с `status='pending'` — никогда напрямую в API.
- `conflict_data.server` в карточке конфликта перечитывается при открытии карточки, не из кэша.
- Фото загружаются отдельным каналом `/sync/photos`, по одному, с прогресс-баром.
- `boqVersionNumber` передаётся с каждой операцией; сервер reject-ит несовместимые версии.
- `open_period` в офлайн-очереди — идемпотентен: дубль заменяет предыдущий pending-запрос.
- При рестарте приложения `is_syncing=true` записи сбрасываются и пересылаются заново.
