# ADR-003 — Офлайн-конфликты: два SC на одной позиции

**Статус:** Принято  
**Дата:** 2026-04-24  
**Риск:** R-03

## Проблема

SC-A офлайн вводит `sc_volume = 80` для позиции W3/P5. SC-B онлайн вводит `sc_volume = 75` на ту же позицию. При восстановлении сети SC-A отправляет `/sync` — данные расходятся. `last-write-wins` запрещён архитектурой.

## Решение

**Детекция через временну́ю метку + ручная резолюция SC с обязательным примечанием.**

## Контракт детекции конфликта

```
sync_queue.client_timestamp  >?<  period_facts.updated_at

Если period_facts.updated_at > client_timestamp → конфликт:
  sync_queue.status = 'conflict'
  sync_queue.conflict_data = {
    server: { value, engineer, at },
    device: { value, engineer, at }
  }

Иначе → применить (идемпотентный повтор или первичная запись)
```

## Контракт резолюции

`POST /sync/resolve`
- `syncQueueId` — ссылка на запись конфликта
- `chosenValue` — выбранный объём
- `note` — примечание SC (обязательно, `@IsNotEmpty`)

Транзакция: `UPDATE period_facts` + `UPDATE sync_queue(status='applied')` + `INSERT audit_log(conflict_resolved)`.

## Инварианты

- `note` обязателен — валидация на уровне DTO, не на уровне БД
- Резолюция возможна только пока `period.status = 'open'`
- Запись `audit_log` содержит обе версии и имя SC, принявшего решение
- `last-write-wins` явно запрещён: синхронизатор никогда не применяет данные без проверки `updated_at`

## UI-контракт (Mobile)

Карточка конфликта показывает обе версии с именем инженера и временем (server vs device). SC обязан выбрать одну и написать примечание перед отправкой.
