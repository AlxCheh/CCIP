# Runtime Governance Enforcement (R3+R4+R5) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Phase 2 RFC «Machine-Enforced Runtime Governance». Подбирает выпавший из Phase 1 Quick Win **R3** (contract-debt эскалация) и вводит первый **блокирующий** enforcement **R4** (pre-agent-gate, в shadow по умолчанию) + агрегацию телеметрии **R5** (inline Feedback Coverage).

**Architecture:** R3 — счётчик `contract_debt` + `governance_alerts[]` в state (Level 1 эскалация контракта). R4 — `PreToolUse[Agent]` gate, выдающий `permissionDecision:deny` при нарушении бюджета агентов / отсутствии security co-agent на HIGH-risk; по умолчанию **shadow** (логирует would-deny, НЕ блокирует), реальный `deny` — за флагом `CCIP_GATE_ENFORCE=1`. R5 — Stop-хук `aggregate-telemetry.js`, сворачивающий `observations` + `events.jsonl` в per-session метрики (§5 feedback-loop). Всё аддитивно; deny-протокол и fail-open копируются из `optimizer-gate.js`.

**Tech Stack:** Node.js 20+ (`node:test`, `node:assert`, `node:child_process`), JSON Schema draft-2020-12 (ajv в тестах), тест-раннер `tools/audit/run-tests.js`, governance `tools/audit/audit-suite.js`, semantic-audit `tools/audit/trigger-integrity.js`.

**Spec:** `docs/plans/specs/2026-06-07-machine-enforced-runtime-governance-design.md` (§4.3 gate, §5.2 contract-debt, §7.4 aggregation, §10 Phase 2, §12 R3/R4/R5)

**Closes gap:** `docs/tasks/runtime-enforcement-design-gap.md` (F-RT-05) — Phase 2.
**Depends on:** PR #17 (R1+R2 — manifest, trigger-integrity, tool-telemetry, events.jsonl) — должен быть в `main`.

---

## Принципы этого PR (инварианты дизайна)

1. **R4 по умолчанию в shadow.** `pre-agent-gate` логирует «would-deny», но пропускает. Реальный `deny` — только при `CCIP_GATE_ENFORCE=1`. Снимает риск false-positive deny на старте (RFC §10 «shadow → FPR → enforce»).
2. **Fail-open везде.** Любой новый хук при внутренней ошибке → `allow`/`exit 0` + stderr (паттерн `optimizer-gate.js`, `post-agent-hook.js`).
3. **`outcome` не трогаем** (ADR-017): `contract_debt` ортогонален task-результату.
4. **Anchor = substring-маркер** (как в R1): каждый новый инвариант manifest указывает на `file#MARKER`, маркер — комментарий в коде; `trigger-integrity` проверит.
5. **Ordering на Stop:** `aggregate-telemetry` ДО `flush-state` — иначе flush очистит `observations` и метрики обнулятся.
6. **Override аудируем:** бюджет агентов обходится `tool_input.override`, факт обхода логируется.

---

## Файлы, затронутые планом

| Файл | Задача | Тип |
|------|--------|-----|
| `docs/schemas/session-state.schema.json` | T-01 | Modify — `contract_debt`, `governance_alerts` |
| `tools/audit/__tests__/schema-contract-debt.test.js` | T-01 | Create |
| `.claude/runtime/post-agent-hook.js` | T-02 | Modify — debt-инкремент + alert + маркер |
| `tools/audit/__tests__/post-agent-hook.test.js` | T-02 | Modify — кейсы |
| `.claude/runtime/governance-manifest.json` | T-02,T-05,T-07 | Modify — новые инварианты |
| `.claude/runtime/pre-agent-gate.js` | T-03,T-04 | Create — PreToolUse[Agent] gate |
| `tools/audit/__tests__/pre-agent-gate.test.js` | T-03,T-04 | Create |
| `docs/schemas/governance-manifest.schema.json` | T-05 | Modify — status `shadow` |
| `.claude/settings.json` | T-05,T-07 | Modify — register hooks |
| `.claude/runtime/aggregate-telemetry.js` | T-06 | Create — Stop metrics rollup |
| `tools/audit/__tests__/aggregate-telemetry.test.js` | T-06 | Create |

> **Перед T-05/T-07:** Read `.claude/settings.json` — подтвердить реальную структуру `hooks` (НЕ предполагать). PreToolUse[Agent] уже содержит `optimizer-gate.js`; Stop содержит `flush-state.js`.

---

# R3 — Contract-debt эскалация (Level 1)

## Task 01: схема — `contract_debt` + `governance_alerts`

**Files:**
- Modify: `docs/schemas/session-state.schema.json`
- Create: `tools/audit/__tests__/schema-contract-debt.test.js`

- [ ] **Step 1: Failing-тест**

`tools/audit/__tests__/schema-contract-debt.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const schema = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/schemas/session-state.schema.json'), 'utf-8'));

test('schema declares optional contract_debt:integer and governance_alerts:array', () => {
  const props = schema.properties;
  assert.strictEqual(props.contract_debt.type, 'integer');
  assert.strictEqual(props.governance_alerts.type, 'array');
  const req = schema.required || [];
  assert.ok(!req.includes('contract_debt'), 'contract_debt must be optional');
  assert.ok(!req.includes('governance_alerts'), 'governance_alerts must be optional');
});

test('schema validates a state carrying contract_debt + an alert', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(JSON.parse(fs.readFileSync(
    path.join(root, 'docs/schemas/intents.json'), 'utf-8')), 'intents.json');
  const validate = ajv.compile(schema);
  const state = {
    session_id: '2026-01-01-1200', task: 't', intents: [], risk: 'LOW',
    confidence: 'HIGH', routing: 'direct', status: 'executing', started_at: '',
    contract_debt: 2,
    governance_alerts: [{ kind: 'state_contract_degraded', at: '2026-01-01T12:00:00.000Z', debt: 2, agent: 'ccip-architect' }],
  };
  assert.equal(validate(state), true, JSON.stringify(validate.errors));
});
```

- [ ] **Step 2: Красный** — `node tools/audit/run-tests.js 2>&1 | grep -A2 "declares optional contract_debt"` → FAIL.

- [ ] **Step 3: Добавить поля в схему.** В `docs/schemas/session-state.schema.json`, после блока `resume_count` (перед `observations`), добавить:
```json
    "contract_debt": {
      "type": "integer",
      "minimum": 0,
      "description": "Счётчик пропусков ## State Update за сессию (ADR-017 Level 1 эскалация)"
    },
    "governance_alerts": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["kind"],
        "properties": {
          "kind":  { "type": "string" },
          "at":    { "type": "string" },
          "debt":  { "type": "integer", "minimum": 0 },
          "agent": { "type": "string" }
        },
        "additionalProperties": false
      }
    },
```
> Запятая после `governance_alerts` обязательна — за ним идёт `observations`.

- [ ] **Step 4: Зелёный** — `node tools/audit/run-tests.js 2>&1 | grep -A1 "validates a state carrying contract_debt"` → PASS.

- [ ] **Step 5: Runtime-state валиден** — `node tools/audit/session-state.js` → `[SESSION-STATE] OK`.

- [ ] **Step 6: Commit**
```bash
git add docs/schemas/session-state.schema.json tools/audit/__tests__/schema-contract-debt.test.js
git commit -m "feat(schema): optional contract_debt + governance_alerts (RFC R3, ADR-017 Level 1)"
```

---

## Task 02: post-agent-hook — инкремент debt + alert при пороге

**Files:**
- Modify: `.claude/runtime/post-agent-hook.js`
- Modify: `tools/audit/__tests__/post-agent-hook.test.js`
- Modify: `.claude/runtime/governance-manifest.json`

- [ ] **Step 1: Failing-тест** (добавить в конец `post-agent-hook.test.js`):
```js
test('contract_debt accumulates and alerts at threshold (RFC R3)', () => {
  const restore = backupState();
  try {
    fs.writeFileSync(STATE, JSON.stringify({
      session_id: '2026-01-01-1200', task: 't', intents: [], risk: 'LOW',
      confidence: 'HIGH', routing: 'direct', dag: [], current_step: 0,
      agent_outputs: {}, status: 'executing', started_at: '', observations: [],
    }), 'utf-8');
    const payload = JSON.stringify({
      tool_name: 'Agent', tool_input: { subagent_type: 'ccip-architect' },
      tool_response: { content: 'no block here' },
    });
    const env = { ...process.env, CCIP_CONTRACT_DEBT_THRESHOLD: '2' };
    // First miss → debt 1, no alert
    cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8', env });
    let after = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
    assert.strictEqual(after.contract_debt, 1);
    assert.ok(!after.governance_alerts || after.governance_alerts.length === 0);
    // Second miss → debt 2, alert raised
    cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8', env });
    after = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
    assert.strictEqual(after.contract_debt, 2);
    assert.strictEqual(after.governance_alerts.length, 1);
    assert.strictEqual(after.governance_alerts[0].kind, 'state_contract_degraded');
  } finally {
    restore();
  }
});

test('valid block does not increment contract_debt (RFC R3)', () => {
  const restore = backupState();
  try {
    fs.writeFileSync(STATE, JSON.stringify({
      session_id: '2026-01-01-1200', task: 't', intents: [], risk: 'LOW',
      confidence: 'HIGH', routing: 'direct', dag: [], current_step: 0,
      agent_outputs: {}, status: 'executing', started_at: '', observations: [],
    }), 'utf-8');
    const payload = JSON.stringify({
      tool_name: 'Agent', tool_input: { subagent_type: 'ccip-architect' },
      tool_response: { content: '## State Update\n```json\n{"summary":"s","artifacts":[],"handoff_notes":""}\n```' },
    });
    cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8' });
    const after = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
    assert.ok(!after.contract_debt, 'debt stays falsy on a compliant call');
  } finally {
    restore();
  }
});
```

- [ ] **Step 2: Красный** — `node tools/audit/run-tests.js 2>&1 | grep -A2 "contract_debt accumulates"` → FAIL.

- [ ] **Step 3: Добавить debt-логику.** В `.claude/runtime/post-agent-hook.js`, ПОСЛЕ блока `state.observations.push({...})` (перед `// ── DAG step advance`), вставить:
```js
  // [INV-CONTRACT-DEBT] RFC R3 — Level 1 escalation: count contract misses, alert at threshold.
  if (missingBlock) {
    const threshold = parseInt(process.env.CCIP_CONTRACT_DEBT_THRESHOLD || '3', 10);
    state.contract_debt = (state.contract_debt || 0) + 1;
    if (state.contract_debt >= threshold) {
      state.governance_alerts = state.governance_alerts || [];
      state.governance_alerts.push({
        kind: 'state_contract_degraded',
        at: new Date().toISOString(),
        debt: state.contract_debt,
        agent,
      });
    }
  }
```

- [ ] **Step 4: Зелёный** — `node tools/audit/run-tests.js 2>&1 | grep -A1 "contract_debt accumulates\|valid block does not increment"` → оба PASS, `fail 0`.

- [ ] **Step 5: Manifest-запись.** В `.claude/runtime/governance-manifest.json`, в массив `invariants`, добавить (после `INV-TOOL-TELEMETRY`):
```json
    {
      "id": "INV-CONTRACT-DEBT",
      "claim": "repeated missing ## State Update accrues contract_debt; threshold raises a governance alert",
      "doc_anchor": "§15",
      "enforcement": "post-agent-hook.js#INV-CONTRACT-DEBT",
      "kind": "signal",
      "status": "observed"
    }
```
> Не забыть запятую после предыдущего элемента массива.

- [ ] **Step 6: Semantic-audit зелёный** — `node tools/audit/trigger-integrity.js` → `[TRIGGER-INTEGRITY] OK`.

- [ ] **Step 7: Commit**
```bash
git add .claude/runtime/post-agent-hook.js tools/audit/__tests__/post-agent-hook.test.js .claude/runtime/governance-manifest.json
git commit -m "feat(runtime): contract_debt escalation + governance alert in post-agent-hook (RFC R3)"
```

---

# R4 — pre-agent-gate (блокирующий enforcement, shadow по умолчанию)

## Task 03: чистая функция `evaluateGate`

**Files:**
- Create: `.claude/runtime/pre-agent-gate.js` (только pure-функция + exports; main — в T-04)
- Create: `tools/audit/__tests__/pre-agent-gate.test.js`

- [ ] **Step 1: Failing-тест** `tools/audit/__tests__/pre-agent-gate.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();
const { evaluateGate } = require(path.join(root, '.claude/runtime/pre-agent-gate.js'));

const agentPayload = (over = {}) => ({ tool_name: 'Agent',
  tool_input: { subagent_type: 'ccip-backend-core', ...over } });

test('within budget, LOW risk → allow', () => {
  const r = evaluateGate({ risk: 'LOW', observations: [{ agent: 'a' }] }, agentPayload(), { maxAgents: 3 });
  assert.strictEqual(r.decision, 'allow');
});

test('budget reached + enforce → deny', () => {
  const state = { risk: 'LOW', observations: [{ agent: 'a' }, { agent: 'b' }, { agent: 'c' }] };
  const r = evaluateGate(state, agentPayload(), { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'deny');
  assert.match(r.reason, /budget/i);
});

test('budget reached + shadow (default) → allow but flags wouldDeny', () => {
  const state = { risk: 'LOW', observations: [{ agent: 'a' }, { agent: 'b' }, { agent: 'c' }] };
  const r = evaluateGate(state, agentPayload(), { enforce: false, maxAgents: 3 });
  assert.strictEqual(r.decision, 'allow');
  assert.strictEqual(r.wouldDeny, true);
});

test('budget reached + override → allow (audited)', () => {
  const state = { risk: 'LOW', observations: [{ agent: 'a' }, { agent: 'b' }, { agent: 'c' }] };
  const r = evaluateGate(state, agentPayload({ override: true }), { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'allow');
  assert.strictEqual(r.overridden, true);
});

test('HIGH risk + security surface + no co-agent + enforce → deny', () => {
  const state = { risk: 'HIGH', intents: ['SECURITY'], observations: [], dag: [] };
  const r = evaluateGate(state, agentPayload(), { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'deny');
  assert.match(r.reason, /security-reviewer/i);
});

test('HIGH risk + security surface + co-agent present → allow', () => {
  const state = { risk: 'HIGH', intents: ['SECURITY'], observations: [],
    dag: [{ agent: 'security-reviewer' }, { agent: 'ccip-backend-core' }] };
  const r = evaluateGate(state, agentPayload(), { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'allow');
});

test('non-Agent payload → allow (gate is Agent-only)', () => {
  const r = evaluateGate({ risk: 'HIGH' }, { tool_name: 'Bash', tool_input: {} }, { enforce: true });
  assert.strictEqual(r.decision, 'allow');
});
```

- [ ] **Step 2: Красный** — `node tools/audit/run-tests.js 2>&1 | grep "budget reached + enforce"` → FAIL (нет модуля).

- [ ] **Step 3: Реализовать pure-функцию** `.claude/runtime/pre-agent-gate.js`:
```js
#!/usr/bin/env node
'use strict';
/**
 * PreToolUse[Agent] gate (RFC R4) — enforces routing invariants BEFORE an Agent spawn.
 *   INVARIANT 1  agent budget (CLAUDE.md §Execution: max 2–3 agents total)
 *   INVARIANT 2  HIGH-risk security surface requires security-reviewer co-agent (Risk Rules)
 *
 * Default SHADOW: logs would-deny but allows. Real deny only under CCIP_GATE_ENFORCE=1.
 * Fail-open: any error → allow (never block a legitimate spawn). Deny protocol copied
 * from optimizer-gate.js.
 */

const SECURITY_RE = /security|auth|rbac|rls/i;

/** Pure decision: returns { decision:'allow'|'deny', reason?, wouldDeny?, overridden? }. */
function evaluateGate(state, payload, opts = {}) {
  const { enforce = false, maxAgents = 3 } = opts;
  if (!payload || payload.tool_name !== 'Agent') return { decision: 'allow' };
  const input = payload.tool_input || {};
  if (input.override) return { decision: 'allow', overridden: true };

  const target = input.subagent_type || '';
  const violations = [];

  // INVARIANT 1 — [INV-AGENT-BUDGET]
  const active = (state.observations || []).filter(o => o && o.agent).length
    + (state.dag || []).filter(s => s && s.status === 'running').length;
  if (active >= maxAgents)
    violations.push(`agent budget ${maxAgents} reached (${active} active) — CLAUDE.md §Execution`);

  // INVARIANT 2 — [INV-SECURITY-COAGENT]
  const securitySurface = (state.intents || []).includes('SECURITY') || SECURITY_RE.test(target);
  const roster = [
    ...((state.dag || []).map(s => s && s.agent)),
    ...((state.observations || []).map(o => o && o.agent)),
  ];
  if (state.risk === 'HIGH' && securitySurface && !roster.includes('security-reviewer'))
    violations.push('HIGH-risk security surface requires security-reviewer co-agent — CLAUDE.md Risk Rules');

  if (violations.length === 0) return { decision: 'allow' };
  const reason = `[pre-agent-gate] ${violations.join('; ')}`;
  return enforce ? { decision: 'deny', reason } : { decision: 'allow', wouldDeny: true, reason };
}

module.exports = { evaluateGate };
```

- [ ] **Step 4: Зелёный** — все 7 тестов PASS.

- [ ] **Step 5: Commit**
```bash
git add .claude/runtime/pre-agent-gate.js tools/audit/__tests__/pre-agent-gate.test.js
git commit -m "feat(runtime): pre-agent-gate evaluateGate — budget + security co-agent invariants (RFC R4)"
```

---

## Task 04: gate main (PreToolUse entrypoint, shadow/enforce)

**Files:**
- Modify: `.claude/runtime/pre-agent-gate.js`
- Modify: `tools/audit/__tests__/pre-agent-gate.test.js`

- [ ] **Step 1: Failing-тест** (добавить в конец `pre-agent-gate.test.js`):
```js
const fs = require('node:fs');
const os = require('node:os');
const cp = require('node:child_process');
const HOOK = path.join(root, '.claude/runtime/pre-agent-gate.js');

function writeTmpState(obj) {
  const tmp = path.join(os.tmpdir(), `gate-state-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(tmp, JSON.stringify(obj), 'utf-8');
  return tmp;
}

test('main: enforce mode emits permissionDecision deny over budget', () => {
  const stateFile = writeTmpState({ session_id: 's', risk: 'LOW',
    observations: [{ agent: 'a' }, { agent: 'b' }, { agent: 'c' }], dag: [] });
  const payload = JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: 'ccip-dba' } });
  try {
    const res = cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8',
      env: { ...process.env, CCIP_GATE_ENFORCE: '1', CCIP_STATE_FILE: stateFile } });
    assert.strictEqual(res.status, 0);
    const out = JSON.parse(res.stdout);
    assert.strictEqual(out.hookSpecificOutput.permissionDecision, 'deny');
  } finally { fs.rmSync(stateFile, { force: true }); }
});

test('main: shadow mode (default) allows but warns on stderr', () => {
  const stateFile = writeTmpState({ session_id: 's', risk: 'LOW',
    observations: [{ agent: 'a' }, { agent: 'b' }, { agent: 'c' }], dag: [] });
  const payload = JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: 'ccip-dba' } });
  try {
    const res = cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8',
      env: { ...process.env, CCIP_STATE_FILE: stateFile } });
    assert.strictEqual(res.status, 0);
    assert.strictEqual(res.stdout.trim(), '', 'shadow must not emit a deny decision');
    assert.match(res.stderr, /would-deny/i);
  } finally { fs.rmSync(stateFile, { force: true }); }
});

test('main: fail-open on malformed payload (exit 0, empty stdout)', () => {
  const res = cp.spawnSync(process.execPath, [HOOK], { input: 'not-json', encoding: 'utf-8' });
  assert.strictEqual(res.status, 0);
  assert.strictEqual(res.stdout.trim(), '');
});
```

- [ ] **Step 2: Красный** — `node tools/audit/run-tests.js 2>&1 | grep "enforce mode emits"` → FAIL.

- [ ] **Step 3: Добавить main** в конец `.claude/runtime/pre-agent-gate.js` (после `module.exports`):
```js
// ── main (PreToolUse[Agent] entrypoint) ─────────────────────────────────────────
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.resolve(__dirname, '../..');
  const STATE = process.env.CCIP_STATE_FILE || path.join(ROOT, '.claude/runtime/session-state.json');
  const ENFORCE = process.env.CCIP_GATE_ENFORCE === '1';
  const MAX = parseInt(process.env.CCIP_MAX_AGENTS || '3', 10);

  const readState = () => {
    try { return JSON.parse(fs.readFileSync(STATE, 'utf-8')); } catch { return {}; }
  };
  const deny = (reason) => process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));

  let raw = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', c => { raw += c; });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(raw);
      const r = evaluateGate(readState(), payload, { enforce: ENFORCE, maxAgents: MAX });
      if (r.overridden) process.stderr.write('[pre-agent-gate] budget override used (audited)\n');
      if (r.wouldDeny) process.stderr.write(`[pre-agent-gate] SHADOW would-deny: ${r.reason}\n`);
      if (r.decision === 'deny') {
        process.stderr.write(`[pre-agent-gate] DENY: ${r.reason}\n`);
        deny(r.reason);
      }
    } catch (e) {
      process.stderr.write(`[pre-agent-gate] ${e.message}\n`); // fail-open: allow
    }
    process.exit(0);
  });
}
```

- [ ] **Step 4: Зелёный** — три main-теста PASS; `fail 0` в полном прогоне.

- [ ] **Step 5: Commit**
```bash
git add .claude/runtime/pre-agent-gate.js tools/audit/__tests__/pre-agent-gate.test.js
git commit -m "feat(runtime): pre-agent-gate PreToolUse entrypoint — shadow default, enforce flag (RFC R4)"
```

---

## Task 05: регистрация gate + manifest + schema status `shadow`

**Files:**
- Modify: `docs/schemas/governance-manifest.schema.json`
- Modify: `.claude/runtime/governance-manifest.json`
- Modify: `.claude/settings.json`

- [ ] **Step 1: Расширить enum status схемы.** В `docs/schemas/governance-manifest.schema.json`, в `status.enum`, добавить `"shadow"`:
```json
          "status":      { "type": "string", "enum": ["enforced", "observed", "advisory", "planned", "shadow"] }
```

- [ ] **Step 2: Failing-тест на регистрацию gate.** Создать ассерт в новом файле `tools/audit/__tests__/pre-agent-gate-wiring.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();

test('pre-agent-gate is registered as a PreToolUse[Agent] hook', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf-8'));
  const pre = settings.hooks.PreToolUse || [];
  const agentBlock = pre.find(b => b.matcher === 'Agent');
  assert.ok(agentBlock, 'PreToolUse[Agent] block must exist');
  const cmds = agentBlock.hooks.map(h => h.command).join(' ');
  assert.match(cmds, /pre-agent-gate\.js/, 'gate must be wired into PreToolUse[Agent]');
});

test('manifest declares the two block invariants in shadow status', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, '.claude/runtime/governance-manifest.json'), 'utf-8'));
  const ids = m.invariants.map(i => i.id);
  for (const id of ['INV-AGENT-BUDGET', 'INV-SECURITY-COAGENT'])
    assert.ok(ids.includes(id), `manifest must declare ${id}`);
  for (const inv of m.invariants.filter(i => ['INV-AGENT-BUDGET', 'INV-SECURITY-COAGENT'].includes(i.id))) {
    assert.strictEqual(inv.kind, 'block');
    assert.strictEqual(inv.status, 'shadow');
  }
});
```

- [ ] **Step 3: Красный** — `node tools/audit/run-tests.js 2>&1 | grep -A1 "registered as a PreToolUse"` → FAIL.

- [ ] **Step 4: Зарегистрировать gate.** В `.claude/settings.json`, в блоке `PreToolUse` с `"matcher": "Agent"` (рядом с `optimizer-gate.js`), добавить второй хук в массив `hooks`:
```json
          {
            "type": "command",
            "command": "cd \"$(git rev-parse --show-toplevel)\" && node .claude/runtime/pre-agent-gate.js"
          }
```
> Добавить запятую после предыдущего элемента `hooks`. Порядок: `optimizer-gate.js` затем `pre-agent-gate.js` — оба независимы (single-flight vs routing-invariants).

- [ ] **Step 5: Manifest-записи.** В `.claude/runtime/governance-manifest.json` добавить два инварианта (маркеры `[INV-AGENT-BUDGET]`/`[INV-SECURITY-COAGENT]` уже стоят в `pre-agent-gate.js` из T-03):
```json
    {
      "id": "INV-AGENT-BUDGET",
      "claim": "max 2–3 agents total — 4th Agent spawn is denied (enforce) or flagged (shadow)",
      "doc_anchor": "agents total",
      "enforcement": "pre-agent-gate.js#INV-AGENT-BUDGET",
      "kind": "block",
      "status": "shadow"
    },
    {
      "id": "INV-SECURITY-COAGENT",
      "claim": "HIGH-risk security surface requires a security-reviewer co-agent",
      "doc_anchor": "security-reviewer as co-agent",
      "enforcement": "pre-agent-gate.js#INV-SECURITY-COAGENT",
      "kind": "block",
      "status": "shadow"
    }
```
> `doc_anchor` — точные подстроки из CLAUDE.md: «agents total» (§Execution) и «security-reviewer as co-agent» (Risk Rules: `HIGH → add security-reviewer as co-agent`). Сверить наличие через `grep -n "agents total" CLAUDE.md` и `grep -n "security-reviewer as co-agent" CLAUDE.md` ПЕРЕД коммитом.

- [ ] **Step 6: Зелёный + semantic-audit** — оба wiring-теста PASS; `node tools/audit/trigger-integrity.js` → OK; `node tools/audit/audit-suite.js | tail -1` → `20/20`.
> Если `doc_anchor` не найден в CLAUDE.md — `trigger-integrity` упадёт: подобрать существующую подстроку или поправить формулировку CLAUDE.md отдельным обоснованным изменением.

- [ ] **Step 7: Commit**
```bash
git add docs/schemas/governance-manifest.schema.json .claude/runtime/governance-manifest.json .claude/settings.json tools/audit/__tests__/pre-agent-gate-wiring.test.js
git commit -m "feat(governance): register pre-agent-gate (shadow) + block invariants in manifest (RFC R4)"
```

---

# R5 — aggregate-telemetry (inline Feedback Coverage)

## Task 06: aggregate-telemetry — per-session метрики

**Files:**
- Create: `.claude/runtime/aggregate-telemetry.js`
- Create: `tools/audit/__tests__/aggregate-telemetry.test.js`

- [ ] **Step 1: Failing-тест** `tools/audit/__tests__/aggregate-telemetry.test.js`:
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
const HOOK = path.join(root, '.claude/runtime/aggregate-telemetry.js');
const STATE = path.join(root, '.claude/runtime/session-state.json');

function backupState() {
  const original = fs.readFileSync(STATE, 'utf-8');
  return () => fs.writeFileSync(STATE, original, 'utf-8');
}

function baseState(observations) {
  return { session_id: '2026-01-01-1200', task: 'metrics-test', intents: [], risk: 'LOW',
    confidence: 'HIGH', routing: 'planner', dag: [], current_step: 0, agent_outputs: {},
    status: 'done', started_at: '', observations };
}

function obs(agent, missing) {
  return { agent, session: '2026-01-01-1200', written_at: '2026-01-01T12:00:00.000Z',
    dag_step: 1, outcome: 'success', context_tokens: 100, reason: '', missing_state_update: missing };
}

test('aggregate writes a §5 metrics line with tool + contract counts', () => {
  const restore = backupState();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-agg-'));
  const feedback = path.join(tmp, 'feedback-loop.md');
  const events = path.join(tmp, 'events.jsonl');
  fs.writeFileSync(events,
    JSON.stringify({ ts: 't', session: 's', tool: 'Read', target: 'a', bytes: 1, full_read: true, outcome: 'ok' }) + '\n' +
    JSON.stringify({ ts: 't', session: 's', tool: 'Bash', target: 'ls', bytes: 1, full_read: false, outcome: 'ok' }) + '\n', 'utf-8');
  try {
    fs.writeFileSync(STATE, JSON.stringify(baseState([obs('ccip-architect', true), obs('ccip-dba', false)])), 'utf-8');
    cp.spawnSync(process.execPath, [HOOK], { encoding: 'utf-8',
      env: { ...process.env, CCIP_FEEDBACK_FILE: feedback, CCIP_EVENTS_FILE: events } });
    const md = fs.readFileSync(feedback, 'utf-8');
    assert.match(md, /## 5\. Session Metrics/);
    assert.match(md, /tool_calls=2/);
    assert.match(md, /full_reads=1/);
    assert.match(md, /agents=2/);
    assert.match(md, /SSC=0\.5/);     // 1 of 2 agents missed the block
    assert.match(md, /inline=true/);  // had tool events
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('aggregate is idempotent on repeated run', () => {
  const restore = backupState();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-agg2-'));
  const feedback = path.join(tmp, 'feedback-loop.md');
  const events = path.join(tmp, 'events.jsonl');
  fs.writeFileSync(events, JSON.stringify({ ts: 't', session: 's', tool: 'Read', target: 'a', bytes: 1, full_read: false, outcome: 'ok' }) + '\n', 'utf-8');
  try {
    fs.writeFileSync(STATE, JSON.stringify(baseState([obs('ccip-architect', false)])), 'utf-8');
    const env = { ...process.env, CCIP_FEEDBACK_FILE: feedback, CCIP_EVENTS_FILE: events };
    cp.spawnSync(process.execPath, [HOOK], { encoding: 'utf-8', env });
    cp.spawnSync(process.execPath, [HOOK], { encoding: 'utf-8', env });
    const md = fs.readFileSync(feedback, 'utf-8');
    const occurrences = (md.match(/tool_calls=1/g) || []).length;
    assert.strictEqual(occurrences, 1, 'metrics line must be written once');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Красный** — `node tools/audit/run-tests.js 2>&1 | grep "§5 metrics line"` → FAIL (нет файла).

- [ ] **Step 3: Реализовать** `.claude/runtime/aggregate-telemetry.js`:
```js
#!/usr/bin/env node
'use strict';
// Stop hook (RFC R5): per-session metrics rollup. Reads observations + events.jsonl,
// writes a §5 line in feedback-loop.md. MUST run BEFORE flush-state (which clears
// observations). Idempotent; fail-open.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');
const STATE_FILE = path.join(ROOT, '.claude/runtime/session-state.json');
const EVENTS_FILE = process.env.CCIP_EVENTS_FILE || path.join(ROOT, '.claude/runtime/events.jsonl');
const FEEDBACK_FILE = process.env.CCIP_FEEDBACK_FILE || path.join(ROOT, 'docs/tasks/feedback-loop.md');
const SECTION = '## 5. Session Metrics';

function run() {
  let state;
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch { return; }

  const observations = state.observations || [];
  let events = [];
  try {
    events = fs.readFileSync(EVENTS_FILE, 'utf-8').trim().split('\n').filter(Boolean).map(JSON.parse);
  } catch { events = []; }

  // [INV-TELEMETRY-AGGREGATE] RFC R5 — events + observations → session metrics
  const sessionId = state.session_id || 'unknown';
  const agents = observations.filter(o => o && o.agent).length;
  const missing = observations.filter(o => o && o.missing_state_update === true).length;
  const ssc = agents ? Number(((agents - missing) / agents).toFixed(2)) : 1;
  const toolCalls = events.length;
  const fullReads = events.filter(e => e && e.full_read === true).length;
  const inline = toolCalls > 0;

  if (agents === 0 && toolCalls === 0) return; // nothing happened this session

  const line = `> 📊 ${sessionId.slice(0, 10)}: tool_calls=${toolCalls} full_reads=${fullReads}`
    + ` agents=${agents} SSC=${ssc} CCR=${ssc} inline=${inline}`;
  const idemKey = `metrics:${sessionId}:${crypto.createHash('sha1')
    .update(`${toolCalls}|${fullReads}|${agents}|${missing}`).digest('hex').slice(0, 8)}`;

  let feedback = '';
  try { feedback = fs.readFileSync(FEEDBACK_FILE, 'utf-8'); } catch {}

  if (!feedback.includes(SECTION)) {
    feedback += `\n\n---\n\n${SECTION}\n\nПер-сессионные метрики (автофлаш при Stop, до flush-state):\n`;
    try {
      fs.mkdirSync(path.dirname(FEEDBACK_FILE), { recursive: true });
      fs.writeFileSync(FEEDBACK_FILE, feedback, 'utf-8');
    } catch (e) { process.stderr.write(`[aggregate-telemetry] ${e.message}\n`); return; }
  }

  if (fs.readFileSync(FEEDBACK_FILE, 'utf-8').includes(idemKey)) {
    process.stderr.write(`[aggregate-telemetry] ⏭ ${idemKey} already flushed — skip\n`);
    return;
  }
  fs.appendFileSync(FEEDBACK_FILE, `\n<!-- ${idemKey} -->\n${line}\n`, 'utf-8');
  process.stdout.write(`[aggregate-telemetry] metrics written (session: ${sessionId})\n`);
}

try { run(); } catch (e) { process.stderr.write(`[aggregate-telemetry] ${e.message}\n`); }
```

- [ ] **Step 4: Зелёный** — оба теста PASS.

- [ ] **Step 5: Commit**
```bash
git add .claude/runtime/aggregate-telemetry.js tools/audit/__tests__/aggregate-telemetry.test.js
git commit -m "feat(telemetry): aggregate-telemetry — per-session metrics rollup, idempotent (RFC R5)"
```

---

## Task 07: регистрация Stop-хука (до flush-state) + manifest

**Files:**
- Modify: `.claude/settings.json`
- Modify: `.claude/runtime/governance-manifest.json`

- [ ] **Step 1: Failing-тест** `tools/audit/__tests__/aggregate-wiring.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();

test('aggregate-telemetry runs on Stop BEFORE flush-state', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf-8'));
  const cmds = settings.hooks.Stop.flatMap(b => b.hooks.map(h => h.command));
  const aggIdx = cmds.findIndex(c => /aggregate-telemetry\.js/.test(c));
  const flushIdx = cmds.findIndex(c => /flush-state\.js/.test(c));
  assert.ok(aggIdx >= 0, 'aggregate-telemetry must be a Stop hook');
  assert.ok(flushIdx >= 0, 'flush-state must remain a Stop hook');
  assert.ok(aggIdx < flushIdx, 'aggregate must run before flush clears observations');
});

test('manifest declares INV-TELEMETRY-AGGREGATE', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, '.claude/runtime/governance-manifest.json'), 'utf-8'));
  assert.ok(m.invariants.some(i => i.id === 'INV-TELEMETRY-AGGREGATE'));
});
```

- [ ] **Step 2: Красный** — `node tools/audit/run-tests.js 2>&1 | grep "BEFORE flush-state"` → FAIL.

- [ ] **Step 3: Зарегистрировать Stop-хук ПЕРЕД flush.** В `.claude/settings.json`, в массив `hooks.Stop`, вставить блок aggregate-telemetry ПЕРВЫМ (до блока с `flush-state.js`):
```json
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "cd \"$(git rev-parse --show-toplevel)\" && node .claude/runtime/aggregate-telemetry.js"
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "cd \"$(git rev-parse --show-toplevel)\" && node .claude/runtime/flush-state.js"
          }
        ]
      }
    ],
```
> Hooks внутри одного hook-события исполняются в порядке массива → aggregate первым гарантирует чтение `observations` до их очистки flush'ем.

- [ ] **Step 4: Manifest-запись** (маркер `[INV-TELEMETRY-AGGREGATE]` уже в коде из T-06):
```json
    {
      "id": "INV-TELEMETRY-AGGREGATE",
      "claim": "Stop-time rollup folds observations + events.jsonl into per-session metrics",
      "doc_anchor": "§15",
      "enforcement": "aggregate-telemetry.js#INV-TELEMETRY-AGGREGATE",
      "kind": "signal",
      "telemetry": "feedback-loop.md:§5",
      "status": "observed"
    }
```

- [ ] **Step 5: Зелёный + semantic-audit** — оба теста PASS; `node tools/audit/trigger-integrity.js` → OK.

- [ ] **Step 6: Commit**
```bash
git add .claude/settings.json .claude/runtime/governance-manifest.json tools/audit/__tests__/aggregate-wiring.test.js
git commit -m "feat(telemetry): register aggregate-telemetry on Stop before flush + manifest (RFC R5)"
```

---

## Финальная проверка

- [ ] **Полный тест-сьют** — `node tools/audit/run-tests.js 2>&1 | grep -E "pass [0-9]+|fail [0-9]+"` → `fail 0`.
- [ ] **Полный audit-suite** — `node tools/audit/audit-suite.js 2>&1 | tail -1` → `Summary: 20/20 passed`.
- [ ] **Semantic-audit** — `node tools/audit/trigger-integrity.js` → `[TRIGGER-INTEGRITY] OK` (8 инвариантов: 4 из R1+R2 + INV-CONTRACT-DEBT + INV-AGENT-BUDGET + INV-SECURITY-COAGENT + INV-TELEMETRY-AGGREGATE).
- [ ] **State-contract цел** — `node tools/audit/state-contract-section.js` → OK.
- [ ] **Manual smoke gate (shadow):** payload с 4-м агентом → stderr `SHADOW would-deny`, stdout пуст (не блокирует).

---

## Сводка RFC → задачи

| RFC-предложение | Задачи |
|-----------------|--------|
| R3: contract-debt эскалация (Level 1) | T-01, T-02 |
| R4: pre-agent-gate (budget + security co-agent, shadow) | T-03, T-04, T-05 |
| R5: aggregate-telemetry + inline FC | T-06, T-07 |
| Closes Phase 1 leftover R3 | T-01, T-02 |

## Вне scope этого PR (следующие фазы)

- Переключение gate в реальный `deny` (флаг `CCIP_GATE_ENFORCE=1` по умолчанию) — отдельное решение после сбора FPR в shadow.
- Reading Discipline Read-gate (R7) — Phase 3.
- fallback capability profiles (R8) — Phase 3.
- RGS-агрегат в CI (R9) + CCR/SSC тренд по истории §5 — Phase 3.
- Level 2 «correct» (реинъекция требования в next prompt) — отдельный цикл.
- Перевод `doc_anchor: §15` телеметрийных инвариантов на точный §-anchor после добавления секции про телеметрию в CLAUDE.md.
