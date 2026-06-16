# Spec: Known Risks Closure — ADR-018 + 4 Code Fixes

**Дата:** 2026-06-09
**Источник:** adversarial audit 2026-06-08, known-risks closure (Вариант A)
**Scope:** ADR-018 re-ratification + UU-3 + HA-7 + HA-1 + SPOF-3

---

## Цель

Закрыть два нижних риска из post-remediation scorecard:

1. **ADR-018 Semantic Integrity** — таблица инвариантов устарела после D-01/02/03: три строки по-прежнему `shadow`, хотя enforcement активирован.
2. **Known risks SPOF-2..5 / HA-1/2/4..7 / UU-1/3** — реализовать code-fix для четырёх рисков с ограниченным scope и реальной ценностью. Остальные 8 остаются accepted (внешние/инфраструктурные триггеры).

---

## Изменение 1 — ADR-018 re-ratification (doc-only)

**Файл:** `docs/decisions/ADR-018-machine-enforced-runtime-governance.md`

**Проблема:** таблица инвариантов в разделе «Инварианты» содержит `**shadow**` для трёх block-инвариантов. После D-01/02/03 (commit `b7272e4`) все три переведены в `enforced` в `governance-manifest.json`. ADR — единственный источник истины для архитектурных решений — расходится с фактическим состоянием.

**Правка:**

В таблице «Инварианты» обновить колонку Status для трёх строк:

| ID | до | после |
|----|-----|-------|
| INV-AGENT-BUDGET | `**shadow**` | `**enforced**` |
| INV-SECURITY-COAGENT | `**shadow**` | `**enforced**` |
| INV-READING-DISCIPLINE | `**shadow**` | `**enforced**` |

Добавить секцию «Revision» перед «Последствия»:

```markdown
## Revision 2026-06-09

D-01/D-02/D-03 (defect-remediation commit `b7272e4`) активировали enforcement для трёх
block-инвариантов после pre-flight верификации (22/22 audit-suite прогонов, 0 false-positive).
Статус `shadow` → `enforced` в `governance-manifest.json` и в таблице выше.
Путь миграции shadow → enforced (см. «Последствия») пройден для этих трёх инвариантов.
```

**Ничего больше не трогать** — остальной текст ADR актуален.

---

## Изменение 2 — UU-3: session_id фильтр (aggregate-telemetry.js)

**Файл:** `.claude/runtime/aggregate-telemetry.js`

**Проблема:** `aggregate-telemetry.js` читает весь `events.jsonl` без фильтрации. События прошлых сессий попадают в метрики текущей: `tool_calls`, `full_reads` завышены. Риск растёт со временем по мере накопления файла.

**Контекст кода:**
- `tool-telemetry.js` пишет каждое событие с полем `session: sessionId()` (строка 33)
- `aggregate-telemetry.js` читает `sessionId = state.session_id || 'unknown'`
- Поле в event — `session`, не `session_id`

**Правка** (после строки `events = fs.readFileSync(...).map(JSON.parse)`, строка 24):

```js
// UU-3: filter to current session only; degrade gracefully if session_id unknown
if (sessionId && sessionId !== 'unknown') {
  events = events.filter(e => e && e.session === sessionId);
}
```

Guard `sessionId !== 'unknown'` обеспечивает graceful degrade: если session_id не был инициализирован до Stop — фильтрация не применяется, сохраняется текущее поведение.

**Тест** (добавить в `tools/audit/__tests__/aggregate-telemetry.test.js`):

```js
// UU-3: events from other sessions must not be counted
// Setup: state с session_id='sess-A', events.jsonl содержит события session='sess-A' и session='sess-B'
// Assert: toolCalls отражает только sess-A события
```

---

## Изменение 3 — HA-7: runtime enum validation intents[] (flush-state.js)

**Файл:** `.claude/runtime/flush-state.js`

**Проблема:** `intents[]` в `session-state.json` пишет LLM-оркестратор; нет runtime-отклонения неизвестных значений. Схема (`intents.json`) закрытая, но проверяется только в `tools/audit/session-state.js` — не в runtime.

**Enum (из `docs/schemas/intents.json`):**
```
ARCH, SCHEMA, BACKEND, AUX, FRONTEND, DEVOPS, QA, MOBILE, SECURITY, DOC
```

**Правка** — добавить в начало файла константу и хелпер, вызвать при чтении state перед flush:

```js
const VALID_INTENTS = new Set(['ARCH','SCHEMA','BACKEND','AUX','FRONTEND',
                                'DEVOPS','QA','MOBILE','SECURITY','DOC']);

function validateIntents(state) {
  const intents = Array.isArray(state.intents) ? state.intents : [];
  const invalid = intents.filter(i => !VALID_INTENTS.has(i));
  if (invalid.length === 0) return;
  process.stderr.write(
    `[flush-state] unknown intents: ${invalid.join(', ')} — expected one of ${[...VALID_INTENTS].join('|')}\n`
  );
  // Append to governance_alerts for observability (non-blocking)
  if (!Array.isArray(state.governance_alerts)) state.governance_alerts = [];
  state.governance_alerts.push({
    kind: 'invalid_intent',
    intents: invalid,
    ts: new Date().toISOString(),
  });
}
```

Вызов: в основной функции `run()`, сразу после чтения state и до записи.

**Fail-open:** функция никогда не бросает и не блокирует flush. Только `stderr` + `governance_alerts[]`.

**Тест** (добавить в `tools/audit/__tests__/flush-state.test.js`):

```js
// HA-7: invalid intent → governance_alert added, valid intents → no alert
```

---

## Изменение 4 — HA-1: sync assertion в writeLock (execute-dag.js)

**Файл:** `.claude/runtime/execute-dag.js`

**Проблема:** `updateState(fn)` — fn() должна быть синхронной. Если передать async-функцию — Promise возвращается из fn(s), writeState() вызывается до завершения мутации, state сохраняется в промежуточном виде.

**Текущий код** (строки 80–87):
```js
function updateState(fn) {
  writeLock = writeLock.then(() => {
    const s = readState();
    fn(s);                  // ← если async — результат игнорируется
    writeState(s);
  });
  return writeLock;
}
```

**Правка** — проверить возвращаемое значение:

```js
function updateState(fn) {
  writeLock = writeLock.then(() => {
    const s = readState();
    const result = fn(s);
    if (result != null && typeof result.then === 'function') {
      throw new Error('[writeLock] fn() must be synchronous — received a thenable');
    }
    writeState(s);
  });
  return writeLock;
}
```

Ошибка попадёт в rejected Promise, который вернёт `updateState()`. Вызывающий код (`writeLock.catch`) уже существует в нескольких местах execute-dag.js — ошибка будет видна.

**Тест** (добавить в `tools/audit/__tests__/execute-dag-writestate.test.js`, файл уже существует):

```js
// HA-1: async fn в updateState → rejected promise
```

---

## Изменение 5 — SPOF-3: schema validation trigger-state (audit-trigger-hook.js + audit-turn-hook.js)

**Файлы:**
- `.claude/runtime/audit-trigger-hook.js`
- `.claude/runtime/audit-turn-hook.js`

**Проблема:** оба файла читают `trigger-state.json` как:
```js
let st = readJSON(TSTATE) || defaultState(sid);
```
`readJSON` защищает от ошибки парсинга JSON, но не от semantically invalid структуры — валидный JSON с неправильными полями приведёт к `undefined` счётчикам, T-06..T-10 не сработают.

**Ожидаемая структура** (из `audit-session-reset.js`):
```js
{ session_id, session_key, total_calls, turn_index, tool_calls_this_turn,
  read_counts, agent_failures_window, audit_in_progress, pending_audit, cooldowns }
```

**Правка** — добавить `validateTriggerState(st, sid)` в оба файла одинаково:

```js
function validateTriggerState(st, sid) {
  const required = ['session_id', 'total_calls', 'turn_index', 'tool_calls_this_turn'];
  const missing = required.filter(k => !(k in st));
  if (missing.length === 0) return st;
  process.stderr.write(
    `[audit-trigger-hook] trigger-state missing fields: ${missing.join(', ')} — using defaultState\n`
  );
  return defaultState(sid);
}
```

Вызов: заменить
```js
let st = readJSON(TSTATE) || defaultState(sid);
```
на
```js
let st = validateTriggerState(readJSON(TSTATE) || defaultState(sid), sid);
```

Дублирование оправдано: оба файла не имеют shared-utils между собой, функция 8 строк, копирование безопаснее добавления нового модуля.

**Тест** (`tools/audit/__tests__/audit-trigger-hook.test.js`, новый):

```js
// SPOF-3: valid JSON с пропущенными полями → defaultState (не падает, не использует broken state)
```

---

## Изменение 6 — known-risks.md статус обновления

**Файл:** `docs/audits/2026-06-08-known-risks.md`

Добавить секцию в начало файла после frontmatter:

```markdown
## Re-evaluation 2026-06-09

Пройдена повторная оценка всех 12 пунктов. Trigger-условия ни одного из них не были достигнуты.
Четыре пункта (UU-3, HA-7, HA-1, SPOF-3) получили code-fix.
Остальные 8 (SPOF-2/4/5, HA-2/4/5/6, UU-1) остаются accepted — внешние или инфраструктурные условия пересмотра не наступили.
```

---

## Затронутые файлы

| Файл | Тип | Изменение |
|------|-----|-----------|
| `docs/decisions/ADR-018-*.md` | doc | таблица инвариантов + Revision секция |
| `.claude/runtime/aggregate-telemetry.js` | runtime | +3 строки UU-3 фильтр |
| `.claude/runtime/flush-state.js` | runtime | +15 строк HA-7 enum validation |
| `.claude/runtime/execute-dag.js` | runtime | +4 строки HA-1 sync assertion |
| `.claude/runtime/audit-trigger-hook.js` | runtime | +8 строк SPOF-3 schema validation |
| `.claude/runtime/audit-turn-hook.js` | runtime | +8 строк SPOF-3 schema validation (идентично) |
| `tools/audit/__tests__/aggregate-telemetry.test.js` | test | +1 тест UU-3 |
| `tools/audit/__tests__/flush-state.test.js` | test | +1 тест HA-7 |
| `tools/audit/__tests__/execute-dag-writestate.test.js` | test | +1 тест HA-1 (файл существует) |
| `tools/audit/__tests__/audit-trigger-hook.test.js` | test | новый файл, +1 тест SPOF-3 |
| `docs/audits/2026-06-08-known-risks.md` | doc | Re-evaluation секция |

---

## Порядок реализации

```
T1  ADR-018 doc update                 — 0 risk, 0 deps
T2  UU-3 aggregate-telemetry fix       — no deps
T3  HA-7 flush-state intents           — no deps
T4  HA-1 execute-dag writeLock         — no deps
T5  SPOF-3 trigger-state validation    — no deps (два файла, одинаковая правка)
T6  Тесты для T2–T5                    — зависит от T2–T5
T7  known-risks.md re-evaluation       — зависит от T2–T5
T8  Full audit suite                   — последний (verify)
```

T1–T5 независимы, могут идти в любом порядке. T6 идёт после T2–T5.

---

## Критерии успеха

- `node --test tools/audit/__tests__/*.test.js` — не меньше 285 pass (было 283 + 4 новых теста)
- `node tools/audit/session-state.js` → OK
- ADR-018 таблица инвариантов соответствует `governance-manifest.json`
- `known-risks.md` содержит Re-evaluation секцию с датой 2026-06-09
- 8 принятых рисков без изменений в тексте обоснования
