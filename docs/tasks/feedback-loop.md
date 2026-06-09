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
| `adr-violation` | Создать ретроспективный ADR¹ | Обновить phase file: пометить отклонение | `ccip-architect` (не нарушитель²) |
| `arch-gap` | Обновить `architecture/<module>.md` | — | `ccip-architect` |
| `arch-gap` (critical) | Создать новый ADR | Добавить блокер в `critical-path.md` | `ccip-architect` |
| `arch-update` | Обновить `architecture/<module>.md §<section>` | — | `ccip-doc-writer` |
| `schema-gap` | — | Добавить задачу ccip-dba в текущую фазу | `ccip-dba` |
| `new-blocker` | Обновить `bounded-context-deps.md §2` | Обновить `critical-path.md` + `definition-of-ready.md` | `ccip-doc-writer` |
| `delivery-slip` | — | Обновить phase file: статус задачи | `ccip-doc-writer` |
| `ac-gap` | — | Обновить phase file: уточнить AC задачи | `ccip-product-owner` |

> ¹ Ретроспективный ADR должен явно ссылаться на нарушенный ADR (`Supersedes:`) и содержать обоснование (`Rationale:`), почему нарушение принято ретроактивно.  
> ² Агент или сессия, зафиксировавшие нарушение (`adr-violation`), **не могут** быть автором ратифицирующего ADR без human sign-off — требуется поле `Reviewer: <human-name>` в новом ADR.

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

### Протокол ратификации ADR (для `adr-violation`)

Когда `ccip-architect` создаёт ретроспективный ADR в ответ на `adr-violation`:

1. **Запрет саморатификации:** агент или сессия, зафиксировавшие нарушение, не могут создавать ратифицирующий ADR без human reviewer. Новый ADR обязан содержать поле `Reviewer: <human-name>` — без него ADR не считается принятым.
2. **Обязательные ссылки:** новый ADR должен содержать `Supersedes: ADR-XXX` (нарушенный) + `Rationale:` объяснение, почему нарушение ретроактивно принято. Ссылка на нарушенный ADR без `Rationale` недопустима.
3. **Метрика:** если > 20% ADR за квартал созданы по маршруту `adr-violation` → зафиксировать FEEDBACK-запись с `Priority: immediate` для `ccip-product-owner` с флагом архитектурного долга.

**Запрещено:** создавать ратификационный ADR в той же сессии, где было обнаружено нарушение, без явного human sign-off.

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


---

## 4. Routing Observations

JSON-записи routing observations (автофлаш при Stop):

<!-- flush: 2026-01-01-1200 | task: test -->
{"agent":"ccip-architect","session":"2026-01-01-1200","written_at":"2026-06-06T16:36:42.144Z","dag_step":1,"outcome":"success","context_tokens":100,"reason":""}

<!-- flush: 2026-06-06-1950 | task:  -->
{"agent":"ccip-architect","session":"2026-06-06-1950","written_at":"2026-06-06T16:59:01.168Z","dag_step":null,"outcome":"success","context_tokens":450,"reason":""}

<!-- flush: 2026-06-06-1950 | task:  -->
{"agent":"ccip-routing-planner","session":"2026-06-06-1950","written_at":"2026-06-06T17:05:00.676Z","dag_step":null,"outcome":"success","context_tokens":648,"reason":""}

<!-- flush: 2026-06-06-1950 | task:  -->
{"agent":"ccip-session-optimizer","session":"2026-06-06-1950","written_at":"2026-06-06T17:41:26.829Z","dag_step":null,"outcome":"success","context_tokens":1071,"reason":""}

<!-- flush: 2026-06-06-1950 | task:  -->
{"agent":"red-team-auditor","session":"2026-06-06-1950","written_at":"2026-06-06T20:03:49.441Z","dag_step":null,"outcome":"success","context_tokens":4334,"reason":""}

<!-- flush: 2026-06-06-1950 | task:  -->
{"agent":"ccip-navigator-optimizer","session":"2026-06-06-1950","written_at":"2026-06-06T20:16:27.603Z","dag_step":null,"outcome":"success","context_tokens":600,"reason":""}

<!-- flush: 2026-06-06-1950 | task:  -->
{"agent":"red-team-auditor","session":"2026-06-06-1950","written_at":"2026-06-06T20:57:20.881Z","dag_step":null,"outcome":"success","context_tokens":5187,"reason":""}

<!-- flush:2026-06-06-1950:2e36ef55 | task:  -->
{"agent":"ccip-session-optimizer","session":"2026-06-06-1950","written_at":"2026-06-07T08:09:17.372Z","dag_step":null,"outcome":"success","context_tokens":1634,"reason":""}

<!-- flush:2026-06-06-1950:f55d440d | task:  -->
{"agent":"red-team-auditor","session":"2026-06-06-1950","written_at":"2026-06-07T13:01:01.150Z","dag_step":null,"outcome":"failed","context_tokens":3670,"reason":"Severity:critical F-01 — fix в flush-state.js:55–63, добавить missing_state_update в сериализованный объект. F-02 требует явного ACK: applyStepResult в execute-dag.js хардкодит outcome:'success' без д","missing_state_update":false}


---

## 5. Session Metrics

Пер-сессионные метрики (автофлаш при Stop, до flush-state):

<!-- metrics:2026-06-06-1950:3642beef -->
> 📊 2026-06-06: tool_calls=62 full_reads=1 agents=0 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:57597590 -->
> 📊 2026-06-06: tool_calls=64 full_reads=1 agents=0 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:4f446209 -->
> 📊 2026-06-06: tool_calls=66 full_reads=1 agents=0 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:2f4b6316 -->
> 📊 2026-06-06: tool_calls=67 full_reads=1 agents=0 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:de1a77f2 -->
> 📊 2026-06-06: tool_calls=70 full_reads=1 agents=0 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:541d65ba -->
> 📊 2026-06-06: tool_calls=79 full_reads=3 agents=0 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:d10af971 -->
> 📊 2026-06-06: tool_calls=165 full_reads=8 agents=0 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:238d044c -->
> 📊 2026-06-06: tool_calls=170 full_reads=8 agents=0 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:19264443 -->
> 📊 2026-06-06: tool_calls=223 full_reads=10 agents=0 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:47409a3e -->
> 📊 2026-06-06: tool_calls=226 full_reads=10 agents=0 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:69979ebd -->
> 📊 2026-06-06: tool_calls=244 full_reads=11 agents=0 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:36a258df -->
> 📊 2026-06-06: tool_calls=261 full_reads=15 agents=1 SSC=0 CCR=0 inline=true

<!-- flush:2026-06-06-1950:c8aa0c48 | task:  -->
{"agent":"ccip-session-optimizer","session":"2026-06-06-1950","written_at":"2026-06-08T05:19:50.785Z","dag_step":null,"outcome":"success","context_tokens":1584,"reason":"","missing_state_update":true}
> ⚠ 2026-06-06: 1/1 agents без ## State Update (ccip-session-optimizer)

<!-- metrics:2026-06-06-1950:3028dfbf -->
> 📊 2026-06-06: tool_calls=304 full_reads=21 agents=1 SSC=0 CCR=0 inline=true

<!-- metrics:2026-06-06-1950:c86b3b1b -->
> 📊 2026-06-06: tool_calls=307 full_reads=21 agents=0 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:4e9b5327 -->
> 📊 2026-06-06: tool_calls=309 full_reads=21 agents=0 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:6b3fec66 -->
> 📊 2026-06-06: tool_calls=331 full_reads=27 agents=0 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:02a6d600 -->
> 📊 2026-06-06: tool_calls=367 full_reads=34 agents=1 SSC=0 CCR=0 inline=true

<!-- flush:2026-06-06-1950:de61a4f0 | task:  -->
{"agent":"ccip-session-optimizer","session":"2026-06-06-1950","written_at":"2026-06-08T18:14:40.210Z","dag_step":null,"outcome":"success","context_tokens":1545,"reason":"","missing_state_update":true}
> ⚠ 2026-06-06: 1/1 agents без ## State Update (ccip-session-optimizer)

<!-- flush:2026-06-06-1950:d939bf01 | task:  -->
{"agent":"red-team-auditor","session":"2026-06-06-1950","written_at":"2026-06-08T18:30:43.719Z","dag_step":null,"outcome":"success","context_tokens":8942,"reason":"","missing_state_update":false}

<!-- metrics:2026-06-06-1950:051475c2 -->
> 📊 2026-06-06: tool_calls=415 full_reads=54 agents=1 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:9f966d7b -->
> 📊 2026-06-06: tool_calls=446 full_reads=70 agents=0 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:ab766f60 -->
> 📊 2026-06-06: tool_calls=447 full_reads=70 agents=0 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:108cc816 -->
> 📊 2026-06-06: tool_calls=450 full_reads=70 agents=0 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:b2053218 -->
> 📊 2026-06-06: tool_calls=459 full_reads=70 agents=0 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:7e5cbd71 -->
> 📊 2026-06-06: tool_calls=464 full_reads=71 agents=0 SSC=1 CCR=1 inline=true

<!-- metrics:2026-06-06-1950:272c0bbe -->
> 📊 2026-06-06: tool_calls=481 full_reads=72 agents=0 SSC=1 CCR=1 inline=true

<!-- flush:2026-01-01-1200:9ad25c89 | task: test -->
{"agent":"ccip-architect","session":"2026-01-01-1200","written_at":"2026-06-09T03:21:50.500Z","dag_step":1,"outcome":"success","context_tokens":100,"reason":"","missing_state_update":false}

<!-- metrics:2026-01-01-1200:297dec7c -->
> 📊 2026-01-01: tool_calls=557 full_reads=77 agents=1 SSC=1 inline=true

<!-- metrics:2026-01-01-1200:e5c9545a -->
> 📊 2026-01-01: tool_calls=565 full_reads=77 agents=0 SSC=1 inline=true

<!-- metrics:2026-05-22-1200:6d8092b9 -->
> 📊 2026-05-22: tool_calls=677 full_reads=77 agents=0 SSC=1 inline=true

<!-- metrics:2026-05-22-1200:e8a6a869 -->
> 📊 2026-05-22: tool_calls=696 full_reads=81 agents=1 SSC=0 inline=true

<!-- flush:2026-05-22-1200:a4b5570a | task: t -->
{"agent":"ccip-session-optimizer","session":"2026-05-22-1200","written_at":"2026-06-09T03:54:19.406Z","dag_step":null,"outcome":"success","context_tokens":1042,"reason":"","missing_state_update":true}
> ⚠ 2026-05-22: 1/1 agents без ## State Update (ccip-session-optimizer)

<!-- metrics:2026-05-22-1200:005a079b -->
> 📊 2026-05-22: tool_calls=707 full_reads=81 agents=0 SSC=1 inline=true

<!-- metrics:2026-05-22-1200:8008ab88 -->
> 📊 2026-05-22: tool_calls=727 full_reads=83 agents=2 SSC=0 inline=true

<!-- flush:2026-05-22-1200:912677a4 | task: t -->
{"agent":"ccip-session-optimizer","session":"2026-05-22-1200","written_at":"2026-06-09T04:27:52.704Z","dag_step":null,"outcome":"success","context_tokens":1074,"reason":"","missing_state_update":true}
{"agent":"ccip-session-optimizer","session":"2026-05-22-1200","written_at":"2026-06-09T04:32:16.871Z","dag_step":null,"outcome":"success","context_tokens":936,"reason":"","missing_state_update":true}
> ⚠ 2026-05-22: 2/2 agents без ## State Update (ccip-session-optimizer, ccip-session-optimizer)

<!-- metrics:2026-05-22-1200:6023ab49 -->
> 📊 2026-05-22: tool_calls=732 full_reads=83 agents=0 SSC=1 inline=true

<!-- metrics:2026-05-22-1200:5714b8b3 -->
> 📊 2026-05-22: tool_calls=739 full_reads=83 agents=0 SSC=1 inline=true

<!-- metrics:2026-05-22-1200:89f35bfe -->
> 📊 2026-05-22: tool_calls=740 full_reads=83 agents=0 SSC=1 inline=true
