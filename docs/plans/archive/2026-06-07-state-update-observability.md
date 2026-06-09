# State Update Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать пропуск/битость блока `## State Update` машинно-наблюдаемым (поле `missing_state_update` в observation) и заметным (stderr + сводка на Stop), сохранив «allowed»-семантику.

**Architecture:** Опциональное поле в схеме `observations[]`; оба писателя state (`post-agent-hook.js`, `execute-dag.js`) выставляют флаг единообразно; `flush-state.js` агрегирует на Stop в человекочитаемую строку. `outcome` не трогается (ортогонален). Контракт фиксируется в ADR-017 + дополнении CLAUDE.md §15.

**Tech Stack:** Node.js 20+ (`node:test`, `node:assert`, `node:child_process`), JSON Schema draft-2020-12, тест-раннер `tools/audit/run-tests.js`, governance `tools/audit/audit-suite.js`.

**Spec:** `docs/plans/specs/2026-06-07-state-update-observability-design.md`

---

## Файлы, затронутые планом

| Файл | Задача | Тип |
|------|--------|-----|
| `docs/schemas/session-state.schema.json` | T-01 | Modify — опц. поле |
| `.claude/runtime/post-agent-hook.js` | T-02 | Modify — флаг + stderr |
| `.claude/runtime/execute-dag.js` | T-03 | Modify — флаг в applyStepResult + stderr + export |
| `.claude/runtime/flush-state.js` | T-04 | Modify — rollup-строка + stderr |
| `CLAUDE.md` | T-05 | Modify — §15 строка про missing block |
| `docs/decisions/ADR-017-state-update-observability.md` | T-05 | Create |
| `docs/decisions/index.md` | T-05 | Modify — строка ADR-017 |
| `tools/audit/__tests__/schema-missing-state-update.test.js` | T-01 | Create |
| `tools/audit/__tests__/post-agent-hook.test.js` | T-02 | Modify — кейсы |
| `tools/audit/__tests__/execute-dag-applystep.test.js` | T-03 | Create |
| `tools/audit/__tests__/flush-state-rollup.test.js` | T-04 | Create |

---

## Task 01: Схема — опциональное поле `missing_state_update`

**Files:**
- Modify: `docs/schemas/session-state.schema.json` (observations items properties)
- Create: `tools/audit/__tests__/schema-missing-state-update.test.js`

- [ ] **Step 1: Написать failing-тест (контракт схемы)**

Создать `tools/audit/__tests__/schema-missing-state-update.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const schema = require(path.join(root, 'docs/schemas/session-state.schema.json'));

test('observation schema sanctions optional missing_state_update:boolean', () => {
  const props = schema.properties.observations.items.properties;
  assert.ok(props.missing_state_update, 'field must be declared in schema');
  assert.strictEqual(props.missing_state_update.type, 'boolean');
  // Field must be optional (not in required) for backward compatibility.
  const required = schema.properties.observations.items.required || [];
  assert.ok(!required.includes('missing_state_update'), 'field must be optional');
  // additionalProperties:false → field MUST be declared or observations would fail.
  assert.strictEqual(schema.properties.observations.items.additionalProperties, false);
});
```

- [ ] **Step 2: Запустить — убедиться что красный**

Run: `node tools/audit/run-tests.js 2>&1 | grep -A3 "missing_state_update:boolean"`
Expected: FAIL — поле ещё не объявлено (`props.missing_state_update` undefined).

- [ ] **Step 3: Добавить поле в схему**

В `docs/schemas/session-state.schema.json`, в `observations.items.properties`, заменить:
```json
          "reason":         { "type": "string" }
        },
        "additionalProperties": false
```
на:
```json
          "reason":         { "type": "string" },
          "missing_state_update": { "type": "boolean" }
        },
        "additionalProperties": false
```

- [ ] **Step 4: Запустить — убедиться что зелёный**

Run: `node tools/audit/run-tests.js 2>&1 | grep -A3 "missing_state_update:boolean"`
Expected: PASS.

- [ ] **Step 5: Проверить, что схема валидирует текущий runtime-state**

Run: `node tools/audit/session-state.js`
Expected: `[SESSION-STATE] OK`.

- [ ] **Step 6: Commit**

```bash
git add docs/schemas/session-state.schema.json tools/audit/__tests__/schema-missing-state-update.test.js
git commit -m "feat(schema): optional missing_state_update field on observations (ADR-017)"
```

---

## Task 02: post-agent-hook — флаг + stderr

**Files:**
- Modify: `.claude/runtime/post-agent-hook.js` (около строк 169, 193-201)
- Modify: `tools/audit/__tests__/post-agent-hook.test.js`

- [ ] **Step 1: Написать failing-тест (добавить в конец post-agent-hook.test.js)**

```js
test('observation flags missing_state_update when no block (ADR-017)', () => {
  const restore = backupState();
  try {
    fs.writeFileSync(STATE, JSON.stringify({
      session_id: '2026-01-01-1200', task: 't', intents: [], risk: 'LOW',
      confidence: 'HIGH', routing: 'direct', dag: [], current_step: 0,
      agent_outputs: {}, status: 'executing', started_at: '', observations: [],
    }), 'utf-8');
    const payload = JSON.stringify({
      tool_name: 'Agent',
      tool_input: { subagent_type: 'ccip-architect' },
      tool_response: { content: 'did the work but forgot the block' },
    });
    const res = cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8' });
    const after = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
    assert.strictEqual(after.observations[0].missing_state_update, true);
    assert.ok(res.stderr.includes('no valid ## State Update'), 'must warn on stderr');
  } finally {
    restore();
  }
});

test('observation missing_state_update false when valid block present (ADR-017)', () => {
  const restore = backupState();
  try {
    fs.writeFileSync(STATE, JSON.stringify({
      session_id: '2026-01-01-1200', task: 't', intents: [], risk: 'LOW',
      confidence: 'HIGH', routing: 'direct', dag: [], current_step: 0,
      agent_outputs: {}, status: 'executing', started_at: '', observations: [],
    }), 'utf-8');
    const payload = JSON.stringify({
      tool_name: 'Agent',
      tool_input: { subagent_type: 'ccip-architect' },
      tool_response: { content: '## State Update\n```json\n{"summary":"s","artifacts":[],"handoff_notes":""}\n```' },
    });
    cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8' });
    const after = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
    assert.strictEqual(after.observations[0].missing_state_update, false);
  } finally {
    restore();
  }
});
```

- [ ] **Step 2: Запустить — убедиться что красный**

Run: `node tools/audit/run-tests.js 2>&1 | grep -A3 "flags missing_state_update"`
Expected: FAIL — поле отсутствует в observation (`undefined !== true`).

- [ ] **Step 3: Добавить вычисление флага + stderr**

В `.claude/runtime/post-agent-hook.js` заменить:
```js
  const text    = responseText(payload.tool_response);
  const tokens  = estimateTokens(text);
  const parsed  = extractStructured(text);
```
на:
```js
  const text    = responseText(payload.tool_response);
  const tokens  = estimateTokens(text);
  const parsed  = extractStructured(text);
  const missingBlock = parsed === null;
  if (missingBlock) {
    process.stderr.write(`[post-agent-hook] ⚠ ${agent}: no valid ## State Update block\n`);
  }
```

- [ ] **Step 4: Добавить поле в observation push**

Заменить:
```js
  state.observations.push({
    agent,
    session:        state.session_id || '',
    written_at:     new Date().toISOString(),
    dag_step:       currentDagStep,
    outcome,
    context_tokens: tokens,
    reason:         outcome === 'success' ? '' : (parsed?.handoff_notes?.slice(0, 200) || ''),
  });
```
на:
```js
  state.observations.push({
    agent,
    session:        state.session_id || '',
    written_at:     new Date().toISOString(),
    dag_step:       currentDagStep,
    outcome,
    context_tokens: tokens,
    reason:         outcome === 'success' ? '' : (parsed?.handoff_notes?.slice(0, 200) || ''),
    missing_state_update: missingBlock,
  });
```

- [ ] **Step 5: Запустить — убедиться что зелёный**

Run: `node tools/audit/run-tests.js 2>&1 | grep -A3 "missing_state_update"`
Expected: оба новых теста PASS, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add .claude/runtime/post-agent-hook.js tools/audit/__tests__/post-agent-hook.test.js
git commit -m "feat(runtime): flag missing State Update block in post-agent-hook (F-RT-04, ADR-017)"
```

---

## Task 03: execute-dag — флаг в applyStepResult + export

**Files:**
- Modify: `.claude/runtime/execute-dag.js` (`applyStepResult` ~250-270, `module.exports`)
- Create: `tools/audit/__tests__/execute-dag-applystep.test.js`

- [ ] **Step 1: Написать failing-тест**

Создать `tools/audit/__tests__/execute-dag-applystep.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const { applyStepResult } = require(path.join(root, '.claude/runtime/execute-dag.js'));

function freshState() {
  return {
    session_id: '2026-01-01-1200',
    dag: [{ step: 1, agent: 'ccip-architect', status: 'running' }],
    current_step: 0, agent_outputs: {}, observations: [],
  };
}

test('applyStepResult flags missing_state_update when output has no block', () => {
  const state = freshState();
  applyStepResult(state, { step: 1, agent: 'ccip-architect' }, 'did work, no block');
  assert.strictEqual(state.observations[0].missing_state_update, true);
  assert.strictEqual(state.observations[0].outcome, 'success',
    'outcome stays success — orthogonal to the contract flag');
});

test('applyStepResult: valid block → missing_state_update false', () => {
  const state = freshState();
  const out = '## State Update\n```json\n{"summary":"s","artifacts":[],"handoff_notes":""}\n```';
  applyStepResult(state, { step: 1, agent: 'ccip-architect' }, out);
  assert.strictEqual(state.observations[0].missing_state_update, false);
});
```

- [ ] **Step 2: Запустить — убедиться что красный**

Run: `node tools/audit/run-tests.js 2>&1 | grep -A3 "applyStepResult flags"`
Expected: FAIL — `applyStepResult` не экспортирован (TypeError) и поле отсутствует.

- [ ] **Step 3: Добавить флаг + stderr в applyStepResult**

В `.claude/runtime/execute-dag.js` заменить начало функции:
```js
function applyStepResult(state, step, output) {
  const upd = extractUpdate(output);
  state.agent_outputs = state.agent_outputs || {};
```
на:
```js
function applyStepResult(state, step, output) {
  const upd = extractUpdate(output);
  if (upd === null) {
    console.error(`[execute-dag] ⚠ ${step.agent}: no valid ## State Update block`);
  }
  state.agent_outputs = state.agent_outputs || {};
```

Заменить observation push:
```js
  state.observations.push({
    agent:          step.agent,
    session:        state.session_id,
    written_at:     new Date().toISOString(),
    dag_step:       step.step,
    outcome:        'success',
    context_tokens: Math.round(output.length / 4),
    reason:         '',
  });
```
на:
```js
  state.observations.push({
    agent:          step.agent,
    session:        state.session_id,
    written_at:     new Date().toISOString(),
    dag_step:       step.step,
    outcome:        'success',
    context_tokens: Math.round(output.length / 4),
    reason:         '',
    missing_state_update: upd === null,
  });
```

- [ ] **Step 4: Экспортировать applyStepResult**

Заменить:
```js
  module.exports = { sanitizeHandoff, buildClaudeArgs, buildPrompt, writeState };
```
на:
```js
  module.exports = { sanitizeHandoff, buildClaudeArgs, buildPrompt, writeState, applyStepResult };
```

- [ ] **Step 5: Запустить — убедиться что зелёный**

Run: `node tools/audit/run-tests.js 2>&1 | grep -A3 "applyStepResult"`
Expected: оба теста PASS.

- [ ] **Step 6: Commit**

```bash
git add .claude/runtime/execute-dag.js tools/audit/__tests__/execute-dag-applystep.test.js
git commit -m "feat(runtime): flag missing State Update in execute-dag applyStepResult (F-RT-02, ADR-017)"
```

---

## Task 04: flush-state — сводная строка на Stop

**Files:**
- Modify: `.claude/runtime/flush-state.js` (формирование block ~65-70 + перед append)
- Create: `tools/audit/__tests__/flush-state-rollup.test.js`

- [ ] **Step 1: Написать failing-тест**

Создать `tools/audit/__tests__/flush-state-rollup.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const HOOK = path.join(root, '.claude/runtime/flush-state.js');
const STATE = path.join(root, '.claude/runtime/session-state.json');

function backupState() {
  const original = fs.readFileSync(STATE, 'utf-8');
  return () => fs.writeFileSync(STATE, original, 'utf-8');
}

function baseState(observations) {
  return {
    session_id: '2026-01-01-1200', task: 'rollup-test', intents: [], risk: 'LOW',
    confidence: 'HIGH', routing: 'planner', dag: [], current_step: 0,
    agent_outputs: {}, status: 'done', started_at: '', observations,
  };
}

function obs(agent, missing) {
  return { agent, session: '2026-01-01-1200', written_at: '2026-01-01T12:00:00.000Z',
    dag_step: 1, outcome: 'success', context_tokens: 100, reason: '',
    missing_state_update: missing };
}

test('flush writes a rollup line naming agents that missed the block', () => {
  const restore = backupState();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-rollup-'));
  const feedback = path.join(tmpDir, 'feedback-loop.md');
  try {
    const env = { ...process.env, CCIP_FEEDBACK_FILE: feedback };
    fs.writeFileSync(STATE, JSON.stringify(baseState([
      obs('ccip-architect', true), obs('ccip-backend-core', false), obs('ccip-dba', true),
    ])), 'utf-8');
    cp.spawnSync(process.execPath, [HOOK], { encoding: 'utf-8', env });
    const md = fs.readFileSync(feedback, 'utf-8');
    assert.ok(/2\/3 agents без ## State Update/.test(md), 'rollup count must be 2/3');
    assert.ok(md.includes('ccip-architect') && md.includes('ccip-dba'),
      'rollup must name the offending agents');
    assert.ok(!md.includes('ccip-backend-core,') && !/\(ccip-backend-core\)/.test(md),
      'compliant agent must not be listed as offender');
  } finally {
    restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('flush writes no rollup line when all observations have the block', () => {
  const restore = backupState();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-rollup2-'));
  const feedback = path.join(tmpDir, 'feedback-loop.md');
  try {
    const env = { ...process.env, CCIP_FEEDBACK_FILE: feedback };
    fs.writeFileSync(STATE, JSON.stringify(baseState([
      obs('ccip-architect', false), obs('ccip-dba', false),
    ])), 'utf-8');
    cp.spawnSync(process.execPath, [HOOK], { encoding: 'utf-8', env });
    const md = fs.readFileSync(feedback, 'utf-8');
    assert.ok(!/без ## State Update/.test(md), 'no rollup line for a fully-compliant session');
  } finally {
    restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Запустить — убедиться что красный**

Run: `node tools/audit/run-tests.js 2>&1 | grep -A3 "rollup line naming"`
Expected: FAIL — сводной строки нет.

- [ ] **Step 3: Добавить подсчёт и rollup-строку**

В `.claude/runtime/flush-state.js` заменить:
```js
  const batchHash = crypto.createHash('sha1')
    .update(lines.join('\n')).digest('hex').slice(0, 8);
  const idemKey = `flush:${sessionId}:${batchHash}`;
  const block = [
    '',
    `<!-- ${idemKey} | task: ${task.slice(0, 60)} -->`,
    ...lines,
    ''
  ].join('\n');
```
на:
```js
  const batchHash = crypto.createHash('sha1')
    .update(lines.join('\n')).digest('hex').slice(0, 8);
  const idemKey = `flush:${sessionId}:${batchHash}`;

  // ADR-017: surface agents that skipped the ## State Update block.
  const missing = observations.filter(o => o.missing_state_update === true);
  const rollup = missing.length > 0
    ? [`> ⚠ ${sessionId.slice(0, 10)}: ${missing.length}/${observations.length} agents без ## State Update (${missing.map(o => o.agent).join(', ')})`]
    : [];
  if (missing.length > 0) {
    process.stderr.write(`[flush-state] ⚠ ${missing.length}/${observations.length} observations missing ## State Update\n`);
  }

  const block = [
    '',
    `<!-- ${idemKey} | task: ${task.slice(0, 60)} -->`,
    ...lines,
    ...rollup,
    ''
  ].join('\n');
```

- [ ] **Step 4: Запустить — убедиться что зелёный**

Run: `node tools/audit/run-tests.js 2>&1 | grep -A3 "rollup line naming"`
Expected: оба теста PASS.

- [ ] **Step 5: Регрессия — идемпотентность flush цела**

Run: `node tools/audit/run-tests.js 2>&1 | grep -E "idempotent|fail [0-9]"`
Expected: idempotency-тест PASS, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add .claude/runtime/flush-state.js tools/audit/__tests__/flush-state-rollup.test.js
git commit -m "feat(runtime): Stop-time rollup of missing State Update blocks in flush-state (ADR-017)"
```

---

## Task 05: Контракт — §15, ADR-017, index

**Files:**
- Modify: `CLAUDE.md` (§15 State Contract, строка про missing block)
- Create: `docs/decisions/ADR-017-state-update-observability.md`
- Modify: `docs/decisions/index.md` (раздел Orchestration / Agent Runtime)

- [ ] **Step 1: Обновить строку §15 в CLAUDE.md**

Заменить:
```
Missing block -> `post-agent-hook.js` sets a fallback summary (allowed, lowers routing quality).
```
на:
```
Missing block -> `post-agent-hook.js` flags the observation `missing_state_update:true` and sets a fallback summary (allowed, lowers routing quality); surfaced via stderr and a Stop-time rollup in feedback-loop.md §4. See ADR-017.
```

- [ ] **Step 2: Создать ADR-017**

Создать `docs/decisions/ADR-017-state-update-observability.md`:
```markdown
---
adr: ADR-017
status: Принято
impl_anchors:
  - .claude/runtime/post-agent-hook.js
  - .claude/runtime/execute-dag.js
  - .claude/runtime/flush-state.js
  - docs/schemas/session-state.schema.json
---

# ADR-017 — State Update Observability

**Статус:** Принято (2026-06-07)
**Связано:** CLAUDE.md §15 State Contract; closes runtime-аудит findings F-RT-02, F-RT-04.

## Контекст

Контракт §15 объявляет блок `## State Update` обязательным, но его отсутствие/битость проходили молча: `post-agent-hook.js` ставил fallback summary без сигнала, `execute-dag.js` писал `outcome:'success'` хардкодом. Деградация routing-качества невидима для машины и человека.

## Решение

Пропуск валидного блока помечается полем `missing_state_update:true` в observation. Поле `outcome` остаётся ортогональным (результат задачи) и НЕ конфлатится с нарушением контракта. Сигнал всплывает по-событийно в stderr и сводной строкой на Stop в feedback-loop.md §4. Observability без enforcement: блок остаётся «allowed» — не блокируем, не ретраим, не корректируем.

## Последствия

- Пропуски контракта машинно-наблюдаемы и заметны человеку.
- `outcome` сохраняет смысл «результат задачи» → корректные routing-сигналы (агент, забывший блок, не выглядит «не справляющимся»).
- Схема `session-state.json` получает опциональное поле — обратно совместимо.
- Задел под пункт 2 (enforcement Feedback-петли) — отдельный цикл.
```

- [ ] **Step 3: Добавить ADR-017 в index.md**

В `docs/decisions/index.md`, в раздел `### Orchestration / Agent Runtime`, после строки ADR-016 добавить:
```markdown
- [ADR-017-state-update-observability.md](ADR-017-state-update-observability.md) — видимость пропуска ## State Update: флаг missing_state_update + сводка на Stop
```

- [ ] **Step 4: Проверить governance-чеки**

Run: `node tools/audit/state-contract-section.js && node tools/audit/adr-anchors.js && node tools/audit/orphan-adrs.js && node tools/audit/section-anchors.js`
Expected: `[STATE-CONTRACT] OK`, `[ADR-ANCHOR] OK`, `[ORPHAN-ADR] OK`, `[SECTION-ANCHOR] OK`.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/decisions/ADR-017-state-update-observability.md docs/decisions/index.md
git commit -m "docs(adr-017): State Update observability — §15 note + ADR + index"
```

---

## Финальная проверка

- [ ] **Полный тест-сьют без падений**

Run: `node tools/audit/run-tests.js 2>&1 | grep -E "pass [0-9]+|fail [0-9]+"`
Expected: `fail 0`.

- [ ] **Полный audit-suite зелёный**

Run: `node tools/audit/audit-suite.js 2>&1 | tail -2`
Expected: `Summary: 19/19 passed`.

---

## Сводка spec → задачи

| Требование spec | Задача |
|-----------------|--------|
| Опц. поле `missing_state_update` в схеме | T-01 |
| post-agent-hook: флаг + stderr | T-02 |
| execute-dag: флаг в applyStepResult, outcome=success, export | T-03 |
| flush-state: человекочитаемая rollup-строка + stderr | T-04 |
| §15 дополнение + ADR-017 + index | T-05 |
| Closes F-RT-02, F-RT-04 | T-02, T-03 |
