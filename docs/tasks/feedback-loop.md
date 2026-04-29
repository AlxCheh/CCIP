# Implementation Feedback Loop

Механизм маршрутизации результатов реализации обратно в архитектуру и delivery план.

**Место в цепочке:** шаг [7] §0 — выполняется **после** завершения задачи.

---

## 0. Триггеры активации

Feedback loop активируется при любом из условий:

| Событие | Тип воздействия |
|---------|----------------|
| ADR-предположение не выполнилось в реализации | Architecture |
| Граница bounded context оказалась другой | Architecture |
| Контракт между модулями расходится с arch doc | Architecture |
| Производительность не соответствует архитектурным ожиданиям | Architecture |
| Фазовая задача заблокирована незарегистрированной зависимостью | Delivery |
| Реализация фазы завершена | Delivery |
| Обнаружен новый блокер для downstream фазы | Delivery |
| Acceptance criteria оказались неполными или неверными | Delivery |
| Schema не поддерживает требования реализации | Both |

> Успешная реализация без отклонений → только шаг §4 (отметка завершения).

---

## 1. Классификация находок

| Класс | Описание | Приоритет |
|-------|----------|-----------|
| `adr-violation` | Реализация отклонилась от ADR-решения | immediate |
| `arch-gap` | Архитектурный документ не описывает реальное поведение | immediate |
| `arch-update` | Реализация корректна, но arch doc устарел | next-session |
| `schema-gap` | schema.prisma не поддерживает нужные модели/поля | immediate |
| `new-blocker` | Обнаружена незарегистрированная blocking зависимость | immediate |
| `delivery-slip` | Фаза завершена позже плана или с меньшим scope | next-session |
| `ac-gap` | AC были неполные, неверные или отсутствовали | next-session |

---

## 2. Routing Table

| Класс | Архитектурное действие | Delivery действие | Агент |
|-------|------------------------|-------------------|-------|
| `adr-violation` | Создать ретроспективный ADR | Обновить phase file: пометить отклонение | `ccip-architect` |
| `arch-gap` | Обновить `architecture/<module>.md` | — | `ccip-architect` |
| `arch-gap` (critical) | Создать новый ADR | Добавить блокер в `critical-path.md` | `ccip-architect` |
| `arch-update` | Обновить `architecture/<module>.md §<section>` | — | `ccip-doc-writer` |
| `schema-gap` | — | Добавить задачу ccip-dba в текущую фазу | `ccip-dba` |
| `new-blocker` | Обновить `bounded-context-deps.md §2` | Обновить `critical-path.md` + `definition-of-ready.md` | `ccip-doc-writer` |
| `delivery-slip` | — | Обновить phase file: статус задачи | `ccip-doc-writer` |
| `ac-gap` | — | Обновить phase file: уточнить AC задачи | `ccip-product-owner` |

---

## 3. Feedback Record — формат

Feedback Record создаётся в `docs/errors/errors_log.md` после ERROR-записи (если она есть) или отдельно.

```md
### FEEDBACK-XXX
Date: YYYY-MM-DD
Error: ERROR-XXX  ← ссылка на связанный error (если есть)
Finding Class: <класс из §1>
Priority: immediate | next-session | deferred

Architecture Action:
- [ ] <Update / Create> : <путь к файлу> §<раздел>
      Описание: <что именно изменить>

Delivery Action:
- [ ] <Update / Create> : <путь к файлу> §<раздел>
      Описание: <что именно изменить>

Assigned Agent: <agent>
Status: open | in-progress | resolved
```

### Правила заполнения

- Если воздействие только архитектурное → Delivery Action: `—`
- Если воздействие только delivery → Architecture Action: `—`
- `Priority: immediate` → агент назначается до закрытия сессии
- `Priority: next-session` → фиксируется, обрабатывается в следующей сессии

---

## 4. Отметка завершения фазовой задачи

При успешном завершении задачи (без отклонений):

1. Открыть `docs/project-state.md`:
   - §2: статус модуля → `✓ done`
   - §5: добавить строку с датой и DONE-ref
   - §1: обновить `Next Milestone` и `Last Updated`
   - если у модуля нет downstream-блокеров → проверить §3 (снять блокер)
2. Открыть phase file текущей задачи — отметить задачу завершённой.
3. Добавить запись в `errors_log.md`:

```md
### DONE-XXX
Date: YYYY-MM-DD
Task: <название задачи>
Phase: <номер этапа>
Result: completed | completed-with-deviations
Notes: <если есть отклонения — ссылка на FEEDBACK-XXX>
```

---

## 5. Architecture Feedback — процедура

Когда Routing Table предписывает обновление arch doc:

1. Открыть `docs/architecture/index.md` — найти нужный модуль.
2. Открыть `architecture/<module>.md` с `limit:30` — найти нужный раздел.
3. Внести минимальное точечное изменение в раздел.
4. Если изменение затрагивает контракт между модулями → также обновить `core-platform.md §8`.

Правило:
> Обновление arch doc без нового ADR допустимо только для уточнений (arch-update).  
> Изменение архитектурного решения требует нового ADR (arch-gap critical, adr-violation).

---

## 6. Delivery Adjustment — процедура

Когда Routing Table предписывает обновление delivery docs:

1. Открыть phase file текущей задачи.
2. Найти раздел задачи.
3. Внести изменение: статус, уточнение AC, новый блокер.
4. Если новый блокер влияет на другие фазы → обновить `critical-path.md` "Сводная таблица".
5. Если блокер должен стать DoR-чеком → добавить в `definition-of-ready.md §1 или §2`.

---

## 7. Read Policy

> Читать `feedback-loop.md` только при наступлении триггера из §0.  
> При стандартном выполнении задачи без отклонений — не читать.  
> Читать только нужный раздел: §1 (классификация) → §2 (routing) → §3 (формат).
