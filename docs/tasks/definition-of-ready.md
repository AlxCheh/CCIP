# Definition of Ready

Перед выполнением задачи агент обязан пройти все применимые чеки.  
**Провал любого чека = задача не готова к выполнению.**

---

## 0. Применимость чеков по Task Type

| Task Type | Phase | Dependency | ADR | Schema | AC |
|-----------|:-----:|:----------:|:---:|:------:|:--:|
| Feature Implementation | ✓ | ✓ | optional | ✓ | ✓ |
| Refactoring | — | ✓ | — | ✓ | — |
| Bug Fix | — | — | — | ✓ | — |
| Architecture Change | ✓ | ✓ | **required** | — | ✓ |
| Research Task | — | — | — | — | — |
| Documentation Update | — | — | — | — | — |
| Performance Optimization | — | ✓ | optional | ✓ | ✓ |
| Security Update | ✓ | ✓ | **required** | ✓ | ✓ |

---

## 1. Check: Phase Ready

**Источник:** `docs/project-state.md §2` (читать с `limit:25` — §1 + §2 видны сразу)

**Процедура:**

1. Найти модуль в таблице §2 по ID (M-XX).
2. Проверить статус: если `✓` — pass; если `○ pending` или `⛔` — смотреть колонку "Блокирует".
3. Для каждого блокирующего модуля: убедиться, что его статус в §2 = `✓`.
4. Если блокер виден в §3 (Active Blockers) — задача заблокирована явно.

**Pass:** все модули-предшественники в §2 имеют статус `✓`.

**Fail → BLOCK:** зафиксировать в `docs/errors/errors_log.md`, добавить в project-state §3, не начинать задачу.

> Если project-state устарел (Last Updated > 3 дней) → дополнительно проверить по `critical-path.md offset:43 limit:20`.

---

## 2. Check: Dependency Ready

**Источник:** `docs/tasks/bounded-context-deps.md §2` — поле `depends_on` для модуля

**Процедура:**

1. Найти модуль в §2 bounded-context-deps.md.
2. Для каждого модуля из `depends_on`: проверить, что его ключевые сервисы/файлы присутствуют в проекте.
3. Если `change_impact = HIGH/CRITICAL`: также проверить `depended_by` — перечислить модули под риском.

**Pass:** все `depends_on` модули реализованы.

**Fail → BLOCK:** задача не может быть выполнена; указать какой модуль-зависимость отсутствует.

---

## 3. Check: ADR Approved

**Источник:** `docs/decisions/index.md` — секция по модулю (читать с `limit:50`)

**Процедура:**

1. Найти модуль в decisions/index.md.
2. Убедиться, что ADR, покрывающий архитектурное решение задачи, существует в списке.
3. Для Architecture Change: ADR должен существовать **до** начала реализации; если нет — создать через `ccip-architect`.

**Pass:** ADR существует и покрывает решение.

**Fail (Architecture Change) → BLOCK:** нельзя реализовывать без ADR; делегировать `ccip-architect` для создания ADR.

**Fail (Feature/Security) → WARNING:** продолжить, но зафиксировать отсутствие ADR в errors_log.md.

---

## 4. Check: Schema Ready

**Источник:** `packages/database/prisma/schema.prisma`

**Процедура:**

1. Grep по названию ключевой модели задачи (например, `model Period`, `model Dispute`).
2. Убедиться, что все поля, необходимые для задачи, присутствуют в модели.

**Pass:** модель и необходимые поля существуют в schema.prisma.

**Fail → BLOCK:** делегировать `ccip-dba` для создания/обновления схемы и миграции; не начинать feature до закрытия блокера.

---

## 5. Check: Acceptance Criteria

**Источник:** релевантный phase file (`docs/delivery/phase-*.md`) — секция текущей задачи

**Процедура:**

1. Открыть phase file (из §1.5 tasks/index.md).
2. Найти секцию задачи.
3. Убедиться, что AC явно перечислены (конкретные условия, не общие формулировки).

**Pass:** AC существуют и конкретны (поведение системы, не "реализовать модуль").

**Fail → WARNING:** продолжить только если AC подразумеваются из ADR; иначе — делегировать `ccip-product-owner` для формулировки AC.

---

## 6. DoR Outcome

```
ВСЕ применимые чеки = Pass
  → задача готова → перейти к §0.1 (Task Type × Phase → Agent → Context)

ЛЮБОЙ чек = Fail (BLOCK)
  → задача не готова
  → зафиксировать в docs/errors/errors_log.md
  → указать: какой чек провалился, что нужно для разблокировки
  → не загружать контекст задачи, не начинать реализацию

ЛЮБОЙ чек = Fail (WARNING)
  → продолжить с ограничением
  → зафиксировать WARNING в docs/errors/errors_log.md
```

---

## 7. Read Policy

Файл читается **до** загрузки контекста задачи — шаг [2.5] цепочки §0.

> Читать с `limit:30` для §0 (таблица применимости).  
> Читать нужный чек (§1–§5) только если он применим по таблице §0.
