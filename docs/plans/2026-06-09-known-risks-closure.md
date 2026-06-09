# Known Risks Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть ADR-018 semantic drift и реализовать четыре code-fix (UU-3, HA-7, HA-1, SPOF-3) из accepted-known-risks, обновить known-risks.md.

**Architecture:** Все изменения изолированы — 5 runtime-файлов, 2 тест-файла расширяются, 1 тест-файл создаётся. T1–T5 независимы. T6–T7 идут после T1–T5.

**Tech Stack:** Node.js (`node:test`, `node:assert/strict`, `node:child_process`), shell hooks.

**Spec:** `docs/plans/specs/2026-06-09-known-risks-closure-design.md`

---

## Файловая карта

| Файл | Действие | Таск |
|------|----------|------|
| `docs/decisions/ADR-018-machine-enforced-runtime-governance.md` | Modify: таблица инвариантов + Revision секция | T1 |
| `.claude/runtime/aggregate-telemetry.js` | Modify: +3 строки UU-3 session фильтр | T2 |
| `tools/audit/__tests__/aggregate-telemetry.test.js` | Modify: +1 тест UU-3 | T2 |
| `.claude/runtime/flush-state.js` | Modify: +VALID_INTENTS + validateIntents | T3 |
| `tools/audit/__tests__/flush-state.test.js` | Modify: +1 тест HA-7 | T3 |
| `.claude/runtime/execute-dag.js` | Modify: +thenable check + export updateState | T4 |
| `tools/audit/__tests__/execute-dag-writestate.test.js` | Modify: +1 тест HA-1 | T4 |
| `.claude/runtime/audit-trigger-hook.js` | Modify: +validateTriggerState | T5 |
| `.claude/runtime/audit-turn-hook.js` | Modify: +validateTriggerState (идентично) | T5 |
| `tools/audit/__tests__/audit-trigger-hook.test.js` | Create: +2 теста SPOF-3 | T5 |
| `docs/audits/2026-06-08-known-risks.md` | Modify: Re-evaluation секция | T6 |

---

## Task 1 — ADR-018: обновить таблицу инвариантов

**Files:**
- Modify: `docs/decisions/ADR-018-machine-enforced-runtime-governance.md`

- [ ] **Step 1: Обновить три строки таблицы инвариантов**

Найти в файле таблицу «Инварианты» (в ней колонки `ID | Kind | Status | Plane`).
Заменить три строки:

```
| INV-AGENT-BUDGET | block | **shadow** | enforcement |
```
на:
```
| INV-AGENT-BUDGET | block | **enforced** | enforcement |
```

```
| INV-SECURITY-COAGENT | block | **shadow** | enforcement |
```
на:
```
| INV-SECURITY-COAGENT | block | **enforced** | enforcement |
```

```
| INV-READING-DISCIPLINE | block | **shadow** | enforcement |
```
на:
```
| INV-READING-DISCIPLINE | block | **enforced** | enforcement |
```

- [ ] **Step 2: Добавить секцию Revision перед «Последствия»**

Найти строку `## Последствия` и вставить перед ней:

```markdown
## Revision 2026-06-09

D-01/D-02/D-03 (defect-remediation commit `b7272e4`) активировали enforcement для трёх
block-инвариантов после pre-flight верификации (22/22 audit-suite прогонов, 0 false-positive).
Статус `shadow` → `enforced` в `governance-manifest.json` и в таблице выше.
Путь миграции shadow → enforced (см. ниже) пройден для этих трёх инвариантов.

```

- [ ] **Step 3: Проверить audit-suite**

```bash
node tools/audit/audit-suite.js
```

Ожидание: `=== Summary: 22/22 passed ===`

- [ ] **Step 4: Коммит**

```bash
git add docs/decisions/ADR-018-machine-enforced-runtime-governance.md
git commit -m "docs(adr): ratify ADR-018 enforcement activation — shadow→enforced for 3 block invariants"
```

---

## Task 2 — UU-3: session_id фильтр в aggregate-telemetry.js

**Files:**
- Modify: `.claude/runtime/aggregate-telemetry.js`
- Modify: `tools/audit/__tests__/aggregate-telemetry.test.js`

Контекст: `tool-telemetry.js` пишет в `events.jsonl` поле `session` (не `session_id`).
`aggregate-telemetry.js` читает `sessionId = state.session_id || 'unknown'`.
Без фильтра все события всех прошлых сессий суммируются в `toolCalls`.

- [ ] **Step 1: Написать падающий тест**

Добавить в конец `tools/audit/__tests__/aggregate-telemetry.test.js`:

```js
test('UU-3: events from other sessions are not counted in current session metrics', () => {
  const restore = backupState();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-agg-uu3-'));
  const feedback = path.join(tmp, 'feedback-loop.md');
  const events = path.join(tmp, 'events.jsonl');
  // 2 events from current session (2026-01-01-1200), 3 from a different session
  fs.writeFileSync(events, [
    JSON.stringify({ ts: 't', session: '2026-01-01-1200', tool: 'Read', target: 'a', bytes: 1, full_read: false, outcome: 'ok' }),
    JSON.stringify({ ts: 't', session: '2026-01-01-1200', tool: 'Bash', target: 'ls', bytes: 1, full_read: false, outcome: 'ok' }),
    JSON.stringify({ ts: 't', session: 'other-session', tool: 'Read', target: 'b', bytes: 1, full_read: false, outcome: 'ok' }),
    JSON.stringify({ ts: 't', session: 'other-session', tool: 'Bash', target: 'ls', bytes: 1, full_read: false, outcome: 'ok' }),
    JSON.stringify({ ts: 't', session: 'other-session', tool: 'Write', target: 'c', bytes: 1, full_read: false, outcome: 'ok' }),
  ].join('\n') + '\n', 'utf-8');
  try {
    fs.writeFileSync(STATE, JSON.stringify(baseState([obs('ccip-architect', false)])), 'utf-8');
    const result = cp.spawnSync(process.execPath, [HOOK], {
      encoding: 'utf-8',
      env: { ...process.env, CCIP_EVENTS_FILE: events, CCIP_FEEDBACK_FILE: feedback },
    });
    assert.strictEqual(result.status, 0, result.stderr);
    const content = fs.readFileSync(feedback, 'utf-8');
    assert.match(content, /tool_calls=2\b/, 'должны считаться только 2 события текущей сессии, а не 5');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Убедиться что тест падает**

```bash
node --test tools/audit/__tests__/aggregate-telemetry.test.js
```

Ожидание: FAIL — `tool_calls=5` вместо `tool_calls=2`.

- [ ] **Step 3: Реализовать фильтр**

Открыть `.claude/runtime/aggregate-telemetry.js`. Найти строку (≈28):
```js
const sessionId = state.session_id || 'unknown';
```

Сразу после неё (перед строкой `const agents = ...`) добавить:

```js
// UU-3: exclude events from other sessions; skip filter if session_id not yet initialised
if (sessionId && sessionId !== 'unknown') {
  events = events.filter(e => e && e.session === sessionId);
}
```

- [ ] **Step 4: Убедиться что тест проходит**

```bash
node --test tools/audit/__tests__/aggregate-telemetry.test.js
```

Ожидание: все тесты PASS.

- [ ] **Step 5: Коммит**

```bash
git add .claude/runtime/aggregate-telemetry.js tools/audit/__tests__/aggregate-telemetry.test.js
git commit -m "fix(telemetry): filter events.jsonl by session_id — exclude cross-session noise (UU-3)"
```

---

## Task 3 — HA-7: runtime enum validation intents[] в flush-state.js

**Files:**
- Modify: `.claude/runtime/flush-state.js`
- Modify: `tools/audit/__tests__/flush-state.test.js`

Контекст: `run()` в flush-state.js читает `session-state.json` и пишет в `feedback-loop.md`.
Guard `if (require.main === module) run();` на строке 161 — безопасно импортировать в тестах.
Для HA-7 тест запускает flush-state.js через `cp.spawnSync` с кастомными env-переменными.

- [ ] **Step 1: Написать падающий тест**

Добавить в конец `tools/audit/__tests__/flush-state.test.js`:

```js
// HA-7 тест: нужны константы из aggregate-telemetry тестов — определяем локально
const os_ha7 = require('os');
const cp_ha7 = require('child_process');
const gitRoot_ha7 = require('../_lib/git-root').gitRoot;
const HOOK_FLUSH = (() => {
  const r = gitRoot_ha7();
  return require('path').join(r, '.claude/runtime/flush-state.js');
})();
const STATE_HA7 = (() => {
  const r = gitRoot_ha7();
  return require('path').join(r, '.claude/runtime/session-state.json');
})();

function baseStateHA7(intents) {
  return {
    session_id: '2026-ha7-test', task: 'ha7-test', intents,
    risk: 'LOW', confidence: 'HIGH', routing: 'direct', dag: [],
    current_step: 0, agent_outputs: {}, status: 'done', started_at: '',
    observations: [
      { agent: 'ccip-architect', session: '2026-ha7-test',
        written_at: new Date().toISOString(), dag_step: 1,
        outcome: 'success', context_tokens: 100, reason: '', missing_state_update: false },
    ],
  };
}

test('HA-7: unknown intent triggers stderr warning', () => {
  const original = fs.readFileSync(STATE_HA7, 'utf-8');
  const tmp = fs.mkdtempSync(path.join(os_ha7.tmpdir(), 'flush-ha7-'));
  const feedback = path.join(tmp, 'feedback.md');
  try {
    fs.writeFileSync(STATE_HA7, JSON.stringify(baseStateHA7(['BOGUS', 'ARCH'])), 'utf-8');
    const result = cp_ha7.spawnSync(process.execPath, [HOOK_FLUSH], {
      encoding: 'utf-8',
      env: { ...process.env, CCIP_STATE_FILE: STATE_HA7, CCIP_FEEDBACK_FILE: feedback },
    });
    assert.ok(result.stderr.includes('unknown intents'), `stderr должен содержать 'unknown intents', получено: ${result.stderr}`);
    assert.ok(result.stderr.includes('BOGUS'), `stderr должен называть BOGUS, получено: ${result.stderr}`);
  } finally {
    fs.writeFileSync(STATE_HA7, original, 'utf-8');
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('HA-7: valid intents produce no stderr warning', () => {
  const original = fs.readFileSync(STATE_HA7, 'utf-8');
  const tmp = fs.mkdtempSync(path.join(os_ha7.tmpdir(), 'flush-ha7-'));
  const feedback = path.join(tmp, 'feedback.md');
  try {
    fs.writeFileSync(STATE_HA7, JSON.stringify(baseStateHA7(['ARCH', 'BACKEND'])), 'utf-8');
    const result = cp_ha7.spawnSync(process.execPath, [HOOK_FLUSH], {
      encoding: 'utf-8',
      env: { ...process.env, CCIP_STATE_FILE: STATE_HA7, CCIP_FEEDBACK_FILE: feedback },
    });
    assert.ok(!result.stderr.includes('unknown intents'), `stderr не должен содержать 'unknown intents' для валидных интентов`);
  } finally {
    fs.writeFileSync(STATE_HA7, original, 'utf-8');
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Убедиться что тест падает**

```bash
node --test tools/audit/__tests__/flush-state.test.js
```

Ожидание: FAIL — нет предупреждения об unknown intent.

- [ ] **Step 3: Реализовать валидацию**

Открыть `.claude/runtime/flush-state.js`. После строки 7 (`const crypto = require('crypto');`) добавить:

```js
const VALID_INTENTS = new Set(['ARCH','SCHEMA','BACKEND','AUX','FRONTEND','DEVOPS','QA','MOBILE','SECURITY','DOC']);

function validateIntents(state) {
  const intents = Array.isArray(state.intents) ? state.intents : [];
  const invalid = intents.filter(i => !VALID_INTENTS.has(i));
  if (invalid.length === 0) return;
  process.stderr.write(
    `[flush-state] unknown intents: ${invalid.join(', ')} — expected one of ${[...VALID_INTENTS].join('|')}\n`
  );
}
```

Затем в функции `run()`, сразу после блока `try { state = ... } catch { return; }` (≈строка 23), перед строкой `const observations = ...` добавить:

```js
validateIntents(state);
```

- [ ] **Step 4: Убедиться что оба теста проходят**

```bash
node --test tools/audit/__tests__/flush-state.test.js
```

Ожидание: все тесты PASS.

- [ ] **Step 5: Коммит**

```bash
git add .claude/runtime/flush-state.js tools/audit/__tests__/flush-state.test.js
git commit -m "fix(flush-state): warn on unknown intents at flush time (HA-7)"
```

---

## Task 4 — HA-1: sync assertion в writeLock (execute-dag.js)

**Files:**
- Modify: `.claude/runtime/execute-dag.js`
- Modify: `tools/audit/__tests__/execute-dag-writestate.test.js`

Контекст: `updateState(fn)` в execute-dag.js — `fn()` должна быть синхронной.
`execute-dag.js` экспортирует через `if (require.main === module)` guard на строке 449.
Нужно добавить `updateState` в экспорт.

- [ ] **Step 1: Написать падающий тест**

Добавить в конец `tools/audit/__tests__/execute-dag-writestate.test.js`:

```js
const { updateState } = require(path.join(root, '.claude/runtime/execute-dag.js'));

test('HA-1: async fn passed to updateState causes a rejected promise', async () => {
  const restore = backupState();
  try {
    if (typeof updateState !== 'function') {
      throw new Error('updateState is not exported from execute-dag.js — add it to module.exports');
    }
    const p = updateState(async () => { /* async mutation — must be rejected */ });
    await assert.rejects(p, /must be synchronous/);
  } finally {
    restore();
  }
});
```

- [ ] **Step 2: Убедиться что тест падает**

```bash
node --test tools/audit/__tests__/execute-dag-writestate.test.js
```

Ожидание: FAIL — `updateState` не экспортируется / нет rejection при async fn.

- [ ] **Step 3: Реализовать assertion и экспорт**

Открыть `.claude/runtime/execute-dag.js`. Найти функцию `updateState` (≈строки 80–87):

```js
function updateState(fn) {
  writeLock = writeLock.then(() => {
    const s = readState();
    fn(s);                   // sync mutation
    writeState(s);           // sync atomic write
  });
  return writeLock;
}
```

Заменить на:

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

Найти строку 449 с `module.exports`:

```js
module.exports = { sanitizeHandoff, buildClaudeArgs, buildPrompt, writeState, applyStepResult };
```

Заменить на:

```js
module.exports = { sanitizeHandoff, buildClaudeArgs, buildPrompt, writeState, applyStepResult, updateState };
```

- [ ] **Step 4: Убедиться что все тесты в файле проходят**

```bash
node --test tools/audit/__tests__/execute-dag-writestate.test.js
```

Ожидание: все тесты PASS.

- [ ] **Step 5: Коммит**

```bash
git add .claude/runtime/execute-dag.js tools/audit/__tests__/execute-dag-writestate.test.js
git commit -m "fix(execute-dag): assert writeLock fn() is synchronous — throw on thenable (HA-1)"
```

---

## Task 5 — SPOF-3: schema validation trigger-state.json

**Files:**
- Modify: `.claude/runtime/audit-trigger-hook.js`
- Modify: `.claude/runtime/audit-turn-hook.js`
- Create: `tools/audit/__tests__/audit-trigger-hook.test.js`

Контекст: оба файла содержат одинаковую функцию `defaultState(sid)` и `readJSON(p)`.
Нужно добавить `validateTriggerState(st, sid)` в оба. Функция одинакова — дублирование оправдано (нет shared-utils между ними).
Требуемые поля (из `audit-session-reset.js`): `session_id`, `total_calls`, `turn_index`, `tool_calls_this_turn`.

- [ ] **Step 1: Создать тест-файл**

Создать `tools/audit/__tests__/audit-trigger-hook.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const HOOK = path.join(root, '.claude/runtime/audit-trigger-hook.js');
const STATE = path.join(root, '.claude/runtime/session-state.json');
const TSTATE = path.join(root, '.claude/audit/trigger-state.json');

function backupFiles() {
  const orig = { state: '', tstate: '' };
  try { orig.state = fs.readFileSync(STATE, 'utf-8'); } catch {}
  try { orig.tstate = fs.readFileSync(TSTATE, 'utf-8'); } catch {}
  return () => {
    try { if (orig.state) fs.writeFileSync(STATE, orig.state, 'utf-8'); } catch {}
    try { if (orig.tstate) fs.writeFileSync(TSTATE, orig.tstate, 'utf-8'); } catch {}
  };
}

function hookPayload(toolName) {
  return JSON.stringify({ tool_name: toolName || 'Read', tool_input: {}, tool_response: '' });
}

test('SPOF-3: valid JSON missing required fields falls back to defaultState (no crash)', () => {
  const restore = backupFiles();
  try {
    // Corrupt trigger-state: valid JSON but missing all required fields
    fs.writeFileSync(TSTATE, JSON.stringify({ garbage: true, session_id: '' }), 'utf-8');
    const result = require('child_process').spawnSync(
      process.execPath, [HOOK],
      { input: hookPayload(), encoding: 'utf-8' }
    );
    assert.strictEqual(result.status, 0, `hook должен завершаться exit 0, получено stderr: ${result.stderr}`);
    // After hook runs, trigger-state.json must be valid (hook writes back)
    const written = JSON.parse(fs.readFileSync(TSTATE, 'utf-8'));
    assert.ok(typeof written.total_calls === 'number', 'total_calls должно быть числом после восстановления из defaultState');
    assert.ok(result.stderr.includes('missing fields'), `stderr должен указывать на missing fields, получено: ${result.stderr}`);
  } finally {
    restore();
  }
});

test('SPOF-3: valid trigger-state passes through without stderr warning', () => {
  const restore = backupFiles();
  try {
    const goodState = {
      session_id: 'test-session', session_key: '2026-01-01T00:00:00Z-abcd',
      total_calls: 5, turn_index: 2, tool_calls_this_turn: 1,
      read_counts: {}, agent_failures_window: [], audit_in_progress: false,
      pending_audit: [], cooldowns: {},
    };
    fs.writeFileSync(TSTATE, JSON.stringify(goodState), 'utf-8');
    const result = require('child_process').spawnSync(
      process.execPath, [HOOK],
      { input: hookPayload(), encoding: 'utf-8' }
    );
    assert.strictEqual(result.status, 0);
    assert.ok(!result.stderr.includes('missing fields'), `stderr не должен содержать 'missing fields' для корректного state`);
  } finally {
    restore();
  }
});
```

- [ ] **Step 2: Убедиться что тесты падают**

```bash
node --test tools/audit/__tests__/audit-trigger-hook.test.js
```

Ожидание: FAIL — нет stderr предупреждения, нет `missing fields`.

- [ ] **Step 3: Добавить validateTriggerState в audit-trigger-hook.js**

Открыть `.claude/runtime/audit-trigger-hook.js`. Найти функцию `defaultState` (≈строка 42). После закрывающей скобки функции `defaultState` (≈строка 55) вставить:

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

Найти строку ≈119:
```js
let st = readJSON(TSTATE) || defaultState(sid);
```
Заменить на:
```js
let st = validateTriggerState(readJSON(TSTATE) || defaultState(sid), sid);
```

- [ ] **Step 4: Добавить validateTriggerState в audit-turn-hook.js**

Открыть `.claude/runtime/audit-turn-hook.js`. Найти функцию `defaultState` (≈строка 35). После закрывающей скобки `defaultState` вставить **идентичную** функцию (только изменить имя хука в сообщении):

```js
function validateTriggerState(st, sid) {
  const required = ['session_id', 'total_calls', 'turn_index', 'tool_calls_this_turn'];
  const missing = required.filter(k => !(k in st));
  if (missing.length === 0) return st;
  process.stderr.write(
    `[audit-turn-hook] trigger-state missing fields: ${missing.join(', ')} — using defaultState\n`
  );
  return defaultState(sid);
}
```

Найти строку ≈98:
```js
let st = readJSON(TSTATE) || defaultState(sid);
```
Заменить на:
```js
let st = validateTriggerState(readJSON(TSTATE) || defaultState(sid), sid);
```

- [ ] **Step 5: Убедиться что тесты проходят**

```bash
node --test tools/audit/__tests__/audit-trigger-hook.test.js
```

Ожидание: оба теста PASS.

- [ ] **Step 6: Коммит**

```bash
git add .claude/runtime/audit-trigger-hook.js .claude/runtime/audit-turn-hook.js tools/audit/__tests__/audit-trigger-hook.test.js
git commit -m "fix(audit-hooks): validate trigger-state schema on load, fallback to defaultState (SPOF-3)"
```

---

## Task 6 — known-risks.md: Re-evaluation секция

**Files:**
- Modify: `docs/audits/2026-06-08-known-risks.md`

- [ ] **Step 1: Добавить Re-evaluation секцию**

Открыть `docs/audits/2026-06-08-known-risks.md`. После строки:
```
**Статус:** принято как known risk — не требует немедленных action items
```
добавить:

```markdown

---

## Re-evaluation 2026-06-09

Пройдена повторная оценка всех 12 пунктов. Trigger-условия ни одного из них не были достигнуты.

Четыре пункта получили code-fix и считаются закрытыми:

| Риск | Fix | Коммит |
|------|-----|--------|
| UU-3 (events.jsonl без session фильтра) | session_id фильтр в aggregate-telemetry.js | fix(telemetry): UU-3 |
| HA-7 (intents enum не валидируется) | validateIntents() в flush-state.js | fix(flush-state): HA-7 |
| HA-1 (writeLock fn sync constraint) | thenable assertion в execute-dag.js updateState | fix(execute-dag): HA-1 |
| SPOF-3 (trigger-state.json corrupt shape) | validateTriggerState() в audit-trigger/turn-hook | fix(audit-hooks): SPOF-3 |

Остальные 8 (SPOF-2/4/5, HA-2/4/5/6, UU-1) остаются accepted — внешние или инфраструктурные trigger-условия не наступили.

---
```

- [ ] **Step 2: Коммит**

```bash
git add docs/audits/2026-06-08-known-risks.md
git commit -m "docs(risks): re-evaluation 2026-06-09 — close UU-3/HA-7/HA-1/SPOF-3, confirm 8 remaining accepted"
```

---

## Task 7 — Финальная верификация

**Files:** нет изменений.

- [ ] **Step 1: Полный тест-сьют**

```bash
node --test tools/audit/__tests__/*.test.js 2>&1 | tail -12
```

Ожидание:
```
ℹ tests 291
ℹ pass 289
ℹ fail 2
```
Только `token-rules-count.test.js` и `token-rules-propose.test.js` падают (pre-existing, параллельный runner; изолированно проходят).

- [ ] **Step 2: Новые тесты изолированно**

```bash
node --test tools/audit/__tests__/aggregate-telemetry.test.js tools/audit/__tests__/flush-state.test.js tools/audit/__tests__/execute-dag-writestate.test.js tools/audit/__tests__/audit-trigger-hook.test.js
```

Ожидание: 0 failures.

- [ ] **Step 3: Audit suite**

```bash
node tools/audit/audit-suite.js
```

Ожидание: `=== Summary: 22/22 passed ===`

- [ ] **Step 4: Проверить session-state**

```bash
node tools/audit/session-state.js
```

Ожидание: `[SESSION-STATE] OK`
