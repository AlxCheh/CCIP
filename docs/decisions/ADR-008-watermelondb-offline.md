# ADR-008 — WatermelonDB и граница offline/online операций

**Статус:** Принято  
**Дата:** 2026-04-25  
**Риск:** R-08

## Проблема

SC работает на строительной площадке без стабильного интернета. Мобильное приложение должно функционировать офлайн: вводить объёмы, прикреплять фото, выставлять флаги расхождений. При восстановлении сети — синхронизировать накопленные действия с сервером.

Два риска без явного архитектурного решения:
1. Неверный выбор offline-хранилища → нет реактивных запросов или плохая производительность на больших наборах данных.
2. Нечёткая граница offline/online → SC пытается закрыть период офлайн → race condition на сервере.

## Альтернативы offline-хранилища

| Технология | Проблема |
|-----------|---------|
| AsyncStorage | Key-value only; нет реляционных запросов; нет реактивности |
| expo-sqlite (прямой) | Нет встроенной реактивности; sync-логику нужно писать с нуля |
| Realm | Проприетарные ограничения; другая модель запросов; сложнее интеграция с React Native |
| **WatermelonDB (принято)** | Построен на SQLite; реактивные запросы через Observable; спроектирован для offline-first React Native; sync-протокол задокументирован |

## Решение

**WatermelonDB** — локальная SQLite база на устройстве SC с реактивными запросами. Все офлайн-действия пишутся в локальную `sync_queue` (зеркало серверной таблицы). При наличии сети — SyncManager отправляет накопленные записи на сервер (`POST /sync`).

## Граница offline/online (контракт)

### Доступно офлайн (ставится в sync_queue)

| Операция | Таблица | Почему можно офлайн |
|---------|---------|---------------------|
| `submit_fact` | `period_facts` (sc_volume) | Основная работа SC; конфликт обрабатывается при sync |
| `upload_photo` | `photos` | Фото загружается в S3 при восстановлении сети |
| `add_discrepancy_note` | `period_facts` (discrepancy_type, note) | Флаг Тип 2 ставится офлайн; server проверит при sync |
| `open_period` | `periods` | Постановка в очередь; server применит с advisory lock |

### Только онлайн (не добавляется в sync_queue)

| Операция | Почему только онлайн |
|---------|---------------------|
| `close_period` | Требует `pg_advisory_xact_lock` (ADR-002); должна проверить `disputes WHERE status='open'`; результат должен быть мгновенно доступен директору |
| `submit_gp_template` | Одноразовый GP token должен быть инвалидирован на сервере атомарно |
| `approve_zero_report` | Действие директора с юридическими последствиями; нельзя на основе устаревшего состояния |

Блокировка в UI: при отсутствии сети кнопки "Закрыть период", "Подтвердить 0-отчёт" → disabled с сообщением "Требует подключения".

## Контракт SyncManager

```typescript
// sync-manager.ts (Mobile)
class SyncManager {
  async sync(): Promise<SyncResult> {
    const pending = await localDb.syncQueue
      .query(Q.where('status', 'pending'))
      .fetch();

    if (pending.length === 0) return { applied: 0, conflicts: 0 };

    const response = await api.post('/sync', {
      entries: pending.map(entry => ({
        id: entry.id,
        operation: entry.operation,
        payload: entry.payload,
        lastKnownVersion: entry.lastKnownVersion,  // ADR-003
        clientTimestamp: entry.clientTimestamp,     // для UI/аудита, не для детекции
      })),
    });

    await localDb.write(async () => {
      for (const result of response.results) {
        const entry = pending.find(e => e.id === result.id);
        await entry.update(e => {
          e.status = result.status; // 'applied' | 'conflict' | 'rejected'
          if (result.conflictData) e.conflictData = result.conflictData;
        });
      }
    });

    return {
      applied: response.results.filter(r => r.status === 'applied').length,
      conflicts: response.results.filter(r => r.status === 'conflict').length,
    };
  }
}
```

## Локальная схема WatermelonDB (структура)

```typescript
// models/SyncQueueEntry.ts
class SyncQueueEntry extends Model {
  static table = 'sync_queue';

  @field('operation')      operation: string;        // 'submit_fact' | 'upload_photo' | ...
  @json('payload', sanitize) payload: object;
  @field('status')         status: string;           // 'pending' | 'applied' | 'conflict' | 'rejected'
  @field('last_known_version') lastKnownVersion: number;
  @field('client_timestamp')   clientTimestamp: number;
  @json('conflict_data', sanitize) conflictData: object | null;
}
```

Локальная схема зеркалирует серверную `sync_queue` — гарантирует консистентность при маппинге.

## Обработка конфликтов на мобильном устройстве

При `status = 'conflict'` SyncManager показывает UI-карточку конфликта (§4.5 архитектуры):
- Device-версию: значение SC с временем ввода.
- Актуальное серверное значение (перечитывается при открытии карточки, не из `conflict_data.server`).
- SC выбирает версию и пишет примечание → `POST /sync/resolve`.

Подробности резолюции — ADR-003.

## open_period в офлайн-режиме

`open_period` ставится в `sync_queue` как обычная операция. При sync сервер применяет `pg_advisory_xact_lock` (ADR-002) и проверяет `zero_reports.status = 'approved'`. Возможные результаты:
- `applied` — период открыт успешно.
- `rejected` — уже существует открытый период или 0-отчёт не утверждён; SC видит уведомление.

Это не конфликт в смысле ADR-003 — это `rejected` с причиной, не требующий ручной резолюции.

## Инварианты

- Только онлайн-операции (`close_period`, `approve_zero_report`, `submit_gp_template`) блокируются на уровне UI при отсутствии сети.
- Все офлайн-операции сериализуются в `sync_queue` с `status='pending'` — никогда напрямую в API.
- `conflict_data.server` в карточке конфликта перечитывается в момент открытия карточки, не берётся из кэша (тот же принцип, что в ADR-003 для resolveConflict).
- Фото загружаются в S3 отдельно — `payload` содержит локальный URI; SyncManager заменяет его на S3-путь после загрузки.
