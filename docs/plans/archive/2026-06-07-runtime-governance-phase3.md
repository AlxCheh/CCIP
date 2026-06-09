# Runtime Governance Phase 3 (R7+R8+R9) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Phase 3 RFC «Machine-Enforced Runtime Governance». Расширяет enforcement на дисциплину чтения (**R7** Read-gate), делает fallback семантическим (**R8** capability profiles), и выводит сводный governance-балл в CI (**R9** RGS, advisory).

**Architecture:** R7 — `PreToolUse[Read]` gate, отклоняющий полное чтение защищённых файлов (§16); shadow по умолчанию, тот же deny-протокол, что у `pre-agent-gate`. R8 — `fallback-profiles.json` + `buildFallbackContext()`, инжектируемый в промпт `execute-dag` через новое опц. поле dag-шага `fallback_for`; профили валидируются audit'ом. R9 — `rgs.js`: детерминированный Runtime Governance Score (статические под-метрики EC + TI из manifest), advisory в audit-suite (exit 0; hard-fail — отдельный Breaking Change).

**Tech Stack:** Node.js 20+ (`node:test`, `node:assert`, `node:child_process`), JSON Schema draft-2020-12 (ajv), `tools/audit/run-tests.js`, `tools/audit/audit-suite.js`, `tools/audit/trigger-integrity.js`.

**Spec:** `docs/plans/specs/2026-06-07-machine-enforced-runtime-governance-design.md` (§4.2 R7, §5.3 R8, §9 metrics, §12 R7/R8/R9)

**Closes gap:** `docs/tasks/runtime-enforcement-design-gap.md` (F-RT-05) — Phase 3.
**Depends on:** PR #18 (R3+R4+R5) — должен быть в `main`. Использует manifest-инварианты Phase 2, `pre-agent-gate` deny-протокол, структуру `PreToolUse`/`Stop` hooks. **Реализацию начинать после мёржа #18** (или ветку Phase 3 стекать на ветку #18).

---

## Принципы этого PR (инварианты дизайна)

1. **R7 по умолчанию в shadow.** Read-gate логирует «would-deny», но пропускает; реальный `deny` — только при `CCIP_READGATE_ENFORCE=1`.
2. **R9 advisory.** RGS считается и печатается, но НЕ роняет CI (exit 0). Hard-fail при `RGS < threshold` — отдельный Breaking Change, вне scope.
3. **R8 без спекулятивного триггера.** Профиль инжектится ТОЛЬКО когда dag-шаг явно несёт `fallback_for: "<original-agent>"` (выставляет routing-planner при деградации). Авто-детект DEGRADED — вне scope.
4. **Fail-open везде.** Любой новый хук при ошибке → allow/exit 0 + stderr.
5. **Anchor = substring-маркер** (как R1): новые инварианты ссылаются на `file#MARKER`.

---

## Файлы, затронутые планом

| Файл | Задача | Тип |
|------|--------|-----|
| `.claude/runtime/read-gate.js` | T-01,T-02 | Create — PreToolUse[Read] gate |
| `tools/audit/__tests__/read-gate.test.js` | T-01,T-02 | Create |
| `.claude/settings.json` | T-03 | Modify — register read-gate |
| `.claude/runtime/governance-manifest.json` | T-03,T-05 | Modify — новые инварианты |
| `tools/audit/__tests__/read-gate-wiring.test.js` | T-03 | Create |
| `.claude/runtime/fallback-profiles.json` | T-04 | Create — seed-профили |
| `.claude/runtime/fallback-context.js` | T-04 | Create — buildFallbackContext |
| `docs/schemas/session-state.schema.json` | T-04 | Modify — dag `fallback_for` |
| `tools/audit/__tests__/fallback-context.test.js` | T-04 | Create |
| `.claude/runtime/execute-dag.js` | T-05 | Modify — инъекция в buildPrompt |
| `tools/audit/fallback-profiles.js` | T-05 | Create — profile-validation audit |
| `tools/audit/audit-suite.js` | T-05,T-07 | Modify — wire-in |
| `tools/audit/__tests__/fallback-profiles-audit.test.js` | T-05 | Create |
| `tools/audit/rgs.js` | T-06 | Create — Runtime Governance Score |
| `tools/audit/__tests__/rgs.test.js` | T-06 | Create |

> **Перед T-03/T-05/T-07:** Read `.claude/settings.json` и `tools/audit/audit-suite.js` — подтвердить структуру (НЕ предполагать). После #18 `PreToolUse[Agent]` содержит `optimizer-gate.js` + `pre-agent-gate.js`; `Stop` содержит `aggregate-telemetry.js` + `flush-state.js`; audit-suite имеет фазу `§10.8 Semantic integrity` с `trigger-integrity.js`.

---

# R7 — Read-gate (Reading Discipline §16)

## Task 01: чистая функция `evaluateReadGate`

**Files:**
- Create: `.claude/runtime/read-gate.js` (pure-функция + exports; main — T-02)
- Create: `tools/audit/__tests__/read-gate.test.js`

- [ ] **Step 1: Failing-тест** `tools/audit/__tests__/read-gate.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();
const { evaluateReadGate } = require(path.join(root, '.claude/runtime/read-gate.js'));

const readPayload = (input) => ({ tool_name: 'Read', tool_input: input });

test('full read of a protected path + enforce → deny', () => {
  const r = evaluateReadGate(readPayload({ file_path: 'docs/architecture/period-engine.md' }),
    { enforce: true });
  assert.strictEqual(r.decision, 'deny');
  assert.match(r.reason, /Reading Discipline|§16/);
});

test('full read of a protected path + shadow → allow but wouldDeny', () => {
  const r = evaluateReadGate(readPayload({ file_path: 'docs/architecture/period-engine.md' }),
    { enforce: false });
  assert.strictEqual(r.decision, 'allow');
  assert.strictEqual(r.wouldDeny, true);
});

test('windows backslash path is normalised before matching', () => {
  const r = evaluateReadGate(readPayload({ file_path: 'D:\\\\repo\\\\docs\\\\architecture\\\\x.md' }),
    { enforce: true });
  assert.strictEqual(r.decision, 'deny');
});

test('bounded read (offset/limit) of a protected path → allow', () => {
  const r = evaluateReadGate(readPayload({ file_path: 'docs/architecture/x.md', limit: 20 }),
    { enforce: true });
  assert.strictEqual(r.decision, 'allow');
});

test('full read of a non-protected path → allow', () => {
  const r = evaluateReadGate(readPayload({ file_path: 'README.md' }), { enforce: true });
  assert.strictEqual(r.decision, 'allow');
});

test('non-Read tool → allow', () => {
  const r = evaluateReadGate({ tool_name: 'Bash', tool_input: {} }, { enforce: true });
  assert.strictEqual(r.decision, 'allow');
});
```

- [ ] **Step 2: Красный** — `node tools/audit/run-tests.js 2>&1 | grep "full read of a protected path + enforce"` → FAIL (нет модуля).

- [ ] **Step 3: Реализовать pure-функцию** `.claude/runtime/read-gate.js`:
```js
#!/usr/bin/env node
'use strict';
/**
 * PreToolUse[Read] gate (RFC R7) — enforces Reading Discipline (CLAUDE.md §16):
 * denies a FULL read (no offset/limit) of a protected, large-by-default path.
 * Default SHADOW; real deny only under CCIP_READGATE_ENFORCE=1. Fail-open.
 */

// [INV-READING-DISCIPLINE] RFC R7 — §16: never full-read these without offset/limit.
const DEFAULT_PROTECTED = ['docs/architecture/', '.claude/agents/'];

function isFullRead(p) {
  if (!p || p.tool_name !== 'Read') return false;
  const i = p.tool_input || {};
  return i.offset == null && i.limit == null;
}

/** Pure decision: { decision:'allow'|'deny', reason?, wouldDeny? }. */
function evaluateReadGate(payload, opts = {}) {
  const { enforce = false, protectedPaths = DEFAULT_PROTECTED } = opts;
  if (!payload || payload.tool_name !== 'Read') return { decision: 'allow' };
  if (!isFullRead(payload)) return { decision: 'allow' };
  const fp = String((payload.tool_input || {}).file_path || '').replace(/\\/g, '/');
  const hit = protectedPaths.find(g => fp.includes(g));
  if (!hit) return { decision: 'allow' };
  const reason = `[read-gate] full read of protected path "${hit}" — use offset/limit `
    + `(CLAUDE.md §16 Reading Discipline)`;
  return enforce ? { decision: 'deny', reason } : { decision: 'allow', wouldDeny: true, reason };
}

module.exports = { evaluateReadGate, isFullRead, DEFAULT_PROTECTED };
```

- [ ] **Step 4: Зелёный** — все 6 тестов PASS.

- [ ] **Step 5: Commit**
```bash
git add .claude/runtime/read-gate.js tools/audit/__tests__/read-gate.test.js
git commit -m "feat(runtime): read-gate evaluateReadGate — Reading Discipline §16 (RFC R7)"
```

---

## Task 02: read-gate main (PreToolUse[Read], shadow/enforce)

**Files:**
- Modify: `.claude/runtime/read-gate.js`
- Modify: `tools/audit/__tests__/read-gate.test.js`

- [ ] **Step 1: Failing-тест** (добавить в конец `read-gate.test.js`):
```js
const fs = require('node:fs');
const cp = require('node:child_process');
const HOOK = path.join(root, '.claude/runtime/read-gate.js');

test('main: enforce mode emits permissionDecision deny on protected full read', () => {
  const payload = JSON.stringify({ tool_name: 'Read', tool_input: { file_path: 'docs/architecture/x.md' } });
  const res = cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8',
    env: { ...process.env, CCIP_READGATE_ENFORCE: '1' } });
  assert.strictEqual(res.status, 0);
  const out = JSON.parse(res.stdout);
  assert.strictEqual(out.hookSpecificOutput.permissionDecision, 'deny');
});

test('main: shadow mode (default) allows but warns on stderr', () => {
  const payload = JSON.stringify({ tool_name: 'Read', tool_input: { file_path: 'docs/architecture/x.md' } });
  const res = cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8' });
  assert.strictEqual(res.status, 0);
  assert.strictEqual(res.stdout.trim(), '');
  assert.match(res.stderr, /would-deny/i);
});

test('main: fail-open on malformed payload', () => {
  const res = cp.spawnSync(process.execPath, [HOOK], { input: 'not-json', encoding: 'utf-8' });
  assert.strictEqual(res.status, 0);
  assert.strictEqual(res.stdout.trim(), '');
});
```

- [ ] **Step 2: Красный** — `node tools/audit/run-tests.js 2>&1 | grep "main: enforce mode emits permissionDecision deny on protected"` → FAIL.

- [ ] **Step 3: Добавить main** в конец `.claude/runtime/read-gate.js`:
```js
// ── main (PreToolUse[Read] entrypoint) ──────────────────────────────────────────
if (require.main === module) {
  const ENFORCE = process.env.CCIP_READGATE_ENFORCE === '1';
  const deny = (reason) => process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
  let raw = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', c => { raw += c; });
  process.stdin.on('end', () => {
    try {
      const r = evaluateReadGate(JSON.parse(raw), { enforce: ENFORCE });
      if (r.wouldDeny) process.stderr.write(`[read-gate] SHADOW would-deny: ${r.reason}\n`);
      if (r.decision === 'deny') { process.stderr.write(`[read-gate] DENY: ${r.reason}\n`); deny(r.reason); }
    } catch (e) {
      process.stderr.write(`[read-gate] ${e.message}\n`); // fail-open
    }
    process.exit(0);
  });
}
```

- [ ] **Step 4: Зелёный** — три main-теста PASS; `fail 0`.

- [ ] **Step 5: Commit**
```bash
git add .claude/runtime/read-gate.js tools/audit/__tests__/read-gate.test.js
git commit -m "feat(runtime): read-gate PreToolUse entrypoint — shadow default, enforce flag (RFC R7)"
```

---

## Task 03: регистрация read-gate + manifest

**Files:**
- Modify: `.claude/settings.json`
- Modify: `.claude/runtime/governance-manifest.json`
- Create: `tools/audit/__tests__/read-gate-wiring.test.js`

- [ ] **Step 1: Failing-тест** `tools/audit/__tests__/read-gate-wiring.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();

test('read-gate is registered as a PreToolUse[Read] hook', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf-8'));
  const block = (settings.hooks.PreToolUse || []).find(b => /Read/.test(b.matcher || ''));
  assert.ok(block, 'a PreToolUse block matching Read must exist');
  assert.match(block.hooks.map(h => h.command).join(' '), /read-gate\.js/);
});

test('manifest declares INV-READING-DISCIPLINE in shadow status', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, '.claude/runtime/governance-manifest.json'), 'utf-8'));
  const inv = m.invariants.find(i => i.id === 'INV-READING-DISCIPLINE');
  assert.ok(inv, 'INV-READING-DISCIPLINE must be declared');
  assert.strictEqual(inv.kind, 'block');
  assert.strictEqual(inv.status, 'shadow');
});
```

- [ ] **Step 2: Красный** — `node tools/audit/run-tests.js 2>&1 | grep "registered as a PreToolUse\[Read\]"` → FAIL.

- [ ] **Step 3: Зарегистрировать хук.** В `.claude/settings.json`, в массив `hooks.PreToolUse`, добавить новый блок (matcher `Read`):
```json
      {
        "matcher": "Read",
        "hooks": [
          {
            "type": "command",
            "command": "cd \"$(git rev-parse --show-toplevel)\" && node .claude/runtime/read-gate.js"
          }
        ]
      }
```
> Добавить запятую после предыдущего элемента массива `PreToolUse`.

- [ ] **Step 4: Manifest-запись.** В `.claude/runtime/governance-manifest.json` добавить (маркер `[INV-READING-DISCIPLINE]` уже в `read-gate.js` из T-01):
```json
    {
      "id": "INV-READING-DISCIPLINE",
      "claim": "full read of a protected large file is denied (enforce) or flagged (shadow) — use offset/limit",
      "doc_anchor": "Reading Discipline",
      "enforcement": "read-gate.js#INV-READING-DISCIPLINE",
      "kind": "block",
      "status": "shadow"
    }
```

- [ ] **Step 5: Зелёный + semantic-audit** — оба теста PASS; `node tools/audit/trigger-integrity.js` → OK; `node tools/audit/audit-suite.js | tail -1` → `20/20`.

- [ ] **Step 6: Commit**
```bash
git add .claude/settings.json .claude/runtime/governance-manifest.json tools/audit/__tests__/read-gate-wiring.test.js
git commit -m "feat(governance): register read-gate (shadow) + INV-READING-DISCIPLINE (RFC R7)"
```

---

# R8 — Fallback capability profiles (семантический fallback)

## Task 04: профили + `buildFallbackContext` + dag `fallback_for`

**Files:**
- Create: `.claude/runtime/fallback-profiles.json`
- Create: `.claude/runtime/fallback-context.js`
- Modify: `docs/schemas/session-state.schema.json` (dag items)
- Create: `tools/audit/__tests__/fallback-context.test.js`

- [ ] **Step 1: Failing-тест** `tools/audit/__tests__/fallback-context.test.js`:
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
const { buildFallbackContext } = require(path.join(root, '.claude/runtime/fallback-context.js'));
const profiles = require(path.join(root, '.claude/runtime/fallback-profiles.json'));

test('buildFallbackContext injects invariants + anchors for a known agent', () => {
  const ctx = buildFallbackContext('ccip-backend-core', profiles);
  assert.match(ctx, /Domain Bootstrap \(fallback for ccip-backend-core\)/);
  assert.match(ctx, /Invariants you MUST preserve/);
  assert.ok(ctx.length > 0);
});

test('buildFallbackContext returns empty string for an unknown agent', () => {
  assert.strictEqual(buildFallbackContext('no-such-agent', profiles), '');
  assert.strictEqual(buildFallbackContext(undefined, profiles), '');
});

test('each profile entry has invariants[] and domain_anchors[]', () => {
  for (const [agent, p] of Object.entries(profiles)) {
    assert.ok(Array.isArray(p.invariants) && p.invariants.length > 0, `${agent}.invariants`);
    assert.ok(Array.isArray(p.domain_anchors), `${agent}.domain_anchors`);
  }
});

test('dag schema accepts an optional fallback_for on a step', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'docs/schemas/session-state.schema.json'), 'utf-8'));
  ajv.addSchema(JSON.parse(fs.readFileSync(path.join(root, 'docs/schemas/intents.json'), 'utf-8')), 'intents.json');
  const validate = ajv.compile(schema);
  const state = { session_id: '2026-01-01-1200', task: 't', intents: [], risk: 'LOW',
    confidence: 'HIGH', routing: 'planner', status: 'executing', started_at: '',
    dag: [{ step: 1, agent: 'general-purpose', status: 'pending', fallback_for: 'ccip-backend-core' }] };
  assert.equal(validate(state), true, JSON.stringify(validate.errors));
});
```

- [ ] **Step 2: Красный** — `node tools/audit/run-tests.js 2>&1 | grep "injects invariants"` → FAIL.

- [ ] **Step 3: Создать профили** `.claude/runtime/fallback-profiles.json`:
```json
{
  "ccip-backend-core": {
    "domain_anchors": ["docs/decisions/index.md"],
    "invariants": [
      "PeriodEngine — state machine; не мутировать period после lock",
      "BullMQ workers идемпотентны; Transactional Outbox обязателен для внешних эффектов"
    ],
    "forbidden": ["прямой UPDATE на immutable period"]
  }
}
```
> `domain_anchors` указывают на РЕАЛЬНЫЕ существующие файлы (валидируется audit'ом T-05). `docs/decisions/index.md` существует; при добавлении профилей — сверять пути.

- [ ] **Step 4: Реализовать** `.claude/runtime/fallback-context.js`:
```js
'use strict';
/** RFC R8 — lightweight knowledge injection for a fallback (DEGRADED→general-purpose). */
function buildFallbackContext(agent, profiles) {
  const p = profiles && agent ? profiles[agent] : null;
  if (!p) return '';
  const inv = (p.invariants || []).map(i => `- ${i}`).join('\n');
  const anchors = (p.domain_anchors || []).join(', ');
  return `## Domain Bootstrap (fallback for ${agent})\n`
    + `Invariants you MUST preserve:\n${inv}\n`
    + (anchors ? `Read before acting: ${anchors}\n` : '');
}
module.exports = { buildFallbackContext };
```

- [ ] **Step 5: Добавить `fallback_for` в dag-схему.** В `docs/schemas/session-state.schema.json`, в `dag.items.properties`, после `"retries"`, добавить:
```json
          "retries":    { "type": "integer", "minimum": 0 },
          "fallback_for": { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" }
```
> Запятая после `"retries"` строки. `fallback_for` — имя оригинального (деградировавшего) агента, чей профиль инжектится.

- [ ] **Step 6: Зелёный** — все 4 теста PASS; `node tools/audit/session-state.js` → OK.

- [ ] **Step 7: Commit**
```bash
git add .claude/runtime/fallback-profiles.json .claude/runtime/fallback-context.js docs/schemas/session-state.schema.json tools/audit/__tests__/fallback-context.test.js
git commit -m "feat(runtime): fallback capability profiles + buildFallbackContext + dag fallback_for (RFC R8)"
```

---

## Task 05: инъекция в execute-dag + profile-validation audit

**Files:**
- Modify: `.claude/runtime/execute-dag.js` (`buildPrompt`, `module.exports`)
- Create: `tools/audit/fallback-profiles.js`
- Modify: `tools/audit/audit-suite.js`
- Modify: `.claude/runtime/governance-manifest.json`
- Create: `tools/audit/__tests__/fallback-profiles-audit.test.js`

- [ ] **Step 1: Failing-тест (инъекция в buildPrompt)** — добавить в `tools/audit/__tests__/execute-dag.test.js`:
```js
test('buildPrompt injects fallback context when step.fallback_for is set (RFC R8)', () => {
  const { buildPrompt } = require(path.join(root, '.claude/runtime/execute-dag.js'));
  const state = { task: 't', session_id: 's', intents: [], risk: 'LOW', confidence: 'HIGH', agent_outputs: {} };
  const step = { step: 1, agent: 'general-purpose', scope: 'do the thing', fallback_for: 'ccip-backend-core' };
  const prompt = buildPrompt(state, step);
  assert.match(prompt, /Domain Bootstrap \(fallback for ccip-backend-core\)/);
});
```
> В `execute-dag.test.js` уже есть `const { gitRoot }`/`root`/`path` (используется для `buildPrompt`-теста overflow). Если нет — добавить как в соседних тестах.

- [ ] **Step 2: Красный** — `node tools/audit/run-tests.js 2>&1 | grep "injects fallback context when step"` → FAIL.

- [ ] **Step 3: Подключить профили + инъекцию в `execute-dag.js`.** Около других `require` вверху файла добавить:
```js
const { buildFallbackContext } = require('./fallback-context');
```
И загрузку профилей (после блока `const ROOT = ...` / констант):
```js
function loadFallbackProfiles() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/runtime/fallback-profiles.json'), 'utf-8')); }
  catch { return {}; }
}
```
В функции `buildPrompt`, заменить начало массива возврата:
```js
  return [
    loadAgent(step.agent) || `You are ${step.agent}, a specialised CCIP agent.`,
```
на:
```js
  // [INV-FALLBACK-PROFILE] RFC R8 — inject domain invariants when this step is a fallback.
  const fallbackCtx = step.fallback_for
    ? buildFallbackContext(step.fallback_for, loadFallbackProfiles()) : '';
  return [
    loadAgent(step.agent) || `You are ${step.agent}, a specialised CCIP agent.`,
    fallbackCtx,
```

- [ ] **Step 4: Экспортировать buildPrompt (если ещё не).** Убедиться, что `module.exports` в `execute-dag.js` содержит `buildPrompt` (он уже экспортирован: `{ sanitizeHandoff, buildClaudeArgs, buildPrompt, writeState, applyStepResult }`). Если нет — добавить.

- [ ] **Step 5: Зелёный (инъекция)** — `node tools/audit/run-tests.js 2>&1 | grep "injects fallback context"` → PASS.

- [ ] **Step 6: Failing-тест (audit профилей)** `tools/audit/__tests__/fallback-profiles-audit.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();
const AUDIT = path.join(root, 'tools/audit/fallback-profiles.js');

test('fallback-profiles audit passes on the real repo profiles', () => {
  const res = cp.spawnSync(process.execPath, [AUDIT], { encoding: 'utf-8', cwd: root });
  assert.strictEqual(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /\[FALLBACK-PROFILES\] OK/);
});

test('fallback-profiles audit fails on a missing domain anchor', () => {
  const tmp = path.join(os.tmpdir(), `profiles-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ 'ccip-x': { invariants: ['x'], domain_anchors: ['docs/does-not-exist.md'] } }), 'utf-8');
  try {
    const res = cp.spawnSync(process.execPath, [AUDIT], { encoding: 'utf-8', cwd: root,
      env: { ...process.env, CCIP_FALLBACK_PROFILES_FILE: tmp } });
    assert.notStrictEqual(res.status, 0);
    assert.match(res.stdout + res.stderr, /does-not-exist|anchor/i);
  } finally { fs.rmSync(tmp, { force: true }); }
});
```

- [ ] **Step 7: Красный** — `node tools/audit/run-tests.js 2>&1 | grep "fallback-profiles audit passes"` → FAIL (нет audit).

- [ ] **Step 8: Реализовать** `tools/audit/fallback-profiles.js`:
```js
#!/usr/bin/env node
'use strict';
// RFC R8 — validates that every fallback profile's domain_anchors resolve to real files.
const fs = require('fs');
const path = require('path');
const { gitRoot } = require('./_lib/git-root');
const root = gitRoot();
const FILE = process.env.CCIP_FALLBACK_PROFILES_FILE
  || path.join(root, '.claude/runtime/fallback-profiles.json');

function fail(msg) { console.log(`[FALLBACK-PROFILES] FAIL: ${msg}`); process.exit(1); }

let profiles;
try { profiles = JSON.parse(fs.readFileSync(FILE, 'utf-8')); }
catch (e) { fail(`cannot read ${FILE}: ${e.message}`); }

for (const [agent, p] of Object.entries(profiles)) {
  for (const anchor of (p.domain_anchors || [])) {
    const file = String(anchor).split('#')[0];
    if (!fs.existsSync(path.join(root, file)))
      fail(`${agent}: domain_anchor file missing — ${file}`);
  }
}
console.log('[FALLBACK-PROFILES] OK');
process.exit(0);
```

- [ ] **Step 9: Зелёный (audit)** — оба audit-теста PASS; `node tools/audit/fallback-profiles.js` → `[FALLBACK-PROFILES] OK`.

- [ ] **Step 10: Зарегистрировать audit + manifest.** В `tools/audit/audit-suite.js`, в фазу `§10.7 Documentation truth`, добавить `'fallback-profiles.js'` в массив. В `.claude/runtime/governance-manifest.json` добавить:
```json
    {
      "id": "INV-FALLBACK-PROFILE",
      "claim": "fallback step injects the degraded specialist's domain invariants into the prompt",
      "doc_anchor": "fallback при DEGRADED",
      "enforcement": "execute-dag.js#INV-FALLBACK-PROFILE",
      "kind": "advisory",
      "status": "observed"
    }
```

- [ ] **Step 11: Зелёный + suite** — `node tools/audit/trigger-integrity.js` → OK; `node tools/audit/audit-suite.js | tail -1` → `21/21`.

- [ ] **Step 12: Commit**
```bash
git add .claude/runtime/execute-dag.js tools/audit/fallback-profiles.js tools/audit/audit-suite.js .claude/runtime/governance-manifest.json tools/audit/__tests__/fallback-profiles-audit.test.js tools/audit/__tests__/execute-dag.test.js
git commit -m "feat(runtime): wire fallback context into execute-dag + profile-validation audit (RFC R8)"
```

---

# R9 — Runtime Governance Score (advisory в CI)

## Task 06: `rgs.js` — детерминированный governance-балл

**Files:**
- Create: `tools/audit/rgs.js`
- Create: `tools/audit/__tests__/rgs.test.js`

> Полный RGS (§9) включает runtime-метрики (CCR/FC/RC), требующие истории телеметрии. В CI стабильно вычислимы детерминированные под-метрики из manifest: **EC** (Enforcement Coverage = инварианты kind∈{block,signal} / всего) и **TI** (Trigger Integrity = 1 если `trigger-integrity` проходит). `rgs.js` печатает их и композитный governance-балл; **advisory** (exit 0). Runtime-метрики подключаются из §5-истории в отдельной итерации.

- [ ] **Step 1: Failing-тест** `tools/audit/__tests__/rgs.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();
const RGS = path.join(root, 'tools/audit/rgs.js');
const { computeEC } = require(RGS);

test('computeEC = enforced share of invariants', () => {
  const m = { invariants: [
    { kind: 'block' }, { kind: 'signal' }, { kind: 'advisory' }, { kind: 'signal' },
  ] };
  assert.strictEqual(computeEC(m), 0.75); // 3 of 4 are block|signal
});

test('rgs.js prints EC + TI + composite and exits 0 (advisory)', () => {
  const res = cp.spawnSync(process.execPath, [RGS], { encoding: 'utf-8', cwd: root });
  assert.strictEqual(res.status, 0);
  assert.match(res.stdout, /\[RGS\]/);
  assert.match(res.stdout, /EC=/);
  assert.match(res.stdout, /TI=/);
});
```

- [ ] **Step 2: Красный** — `node tools/audit/run-tests.js 2>&1 | grep "computeEC = enforced share"` → FAIL.

- [ ] **Step 3: Реализовать** `tools/audit/rgs.js`:
```js
#!/usr/bin/env node
'use strict';
// RFC R9 — Runtime Governance Score (advisory). Deterministic governance sub-metrics
// from the manifest: EC (enforcement coverage) + TI (trigger integrity). Always exit 0;
// hard-fail on threshold is a separate Breaking Change.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { gitRoot } = require('./_lib/git-root');
const root = gitRoot();

function computeEC(manifest) {
  const inv = manifest.invariants || [];
  if (inv.length === 0) return 1;
  const enforced = inv.filter(i => i.kind === 'block' || i.kind === 'signal').length;
  return Number((enforced / inv.length).toFixed(2));
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(root, '.claude/runtime/governance-manifest.json'), 'utf-8'));
  const ec = computeEC(manifest);
  const ti = cp.spawnSync(process.execPath, [path.join(root, 'tools/audit/trigger-integrity.js')],
    { cwd: root }).status === 0 ? 1 : 0;
  // Composite of the two deterministic governance axes (equal weight).
  const rgs = Number(((ec + ti) / 2).toFixed(2));
  console.log(`[RGS] governance-static=${rgs} (EC=${ec} TI=${ti}) — advisory`);
  process.exit(0);
}

if (require.main === module) main();
module.exports = { computeEC };
```

- [ ] **Step 4: Зелёный** — оба теста PASS; `node tools/audit/rgs.js` печатает `[RGS] ...`.

- [ ] **Step 5: Commit**
```bash
git add tools/audit/rgs.js tools/audit/__tests__/rgs.test.js
git commit -m "feat(governance): rgs.js — deterministic Runtime Governance Score (EC+TI), advisory (RFC R9)"
```

---

## Task 07: register rgs.js в audit-suite (advisory)

**Files:**
- Modify: `tools/audit/audit-suite.js`
- Create: `tools/audit/__tests__/rgs-wiring.test.js`

- [ ] **Step 1: Failing-тест** `tools/audit/__tests__/rgs-wiring.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();

test('audit-suite registers rgs.js', () => {
  const src = fs.readFileSync(path.join(root, 'tools/audit/audit-suite.js'), 'utf-8');
  assert.match(src, /rgs\.js/);
});
```

- [ ] **Step 2: Красный** — `node tools/audit/run-tests.js 2>&1 | grep "audit-suite registers rgs"` → FAIL.

- [ ] **Step 3: Зарегистрировать.** В `tools/audit/audit-suite.js`, в фазу `§10.8 Semantic integrity`, добавить `'rgs.js'` после `'trigger-integrity.js'`:
```js
  '§10.8 Semantic integrity': [
    'trigger-integrity.js',
    'rgs.js',
  ],
```

- [ ] **Step 4: Зелёный + suite** — тест PASS; `node tools/audit/audit-suite.js 2>&1 | grep -E "RGS|Summary"` → строка `[RGS] ...` и `Summary: 22/22 passed`.
> rgs.js всегда exit 0 (advisory), поэтому suite остаётся зелёным.

- [ ] **Step 5: Commit**
```bash
git add tools/audit/audit-suite.js tools/audit/__tests__/rgs-wiring.test.js
git commit -m "feat(governance): register rgs.js in audit-suite as advisory reporter (RFC R9)"
```

---

## Финальная проверка

- [ ] **Полный тест-сьют** — `node tools/audit/run-tests.js 2>&1 | grep -E "pass [0-9]+|fail [0-9]+"` → `fail 0`.
- [ ] **Полный audit-suite** — `node tools/audit/audit-suite.js 2>&1 | tail -1` → `Summary: 22/22 passed` (20 после #18 + fallback-profiles + rgs).
- [ ] **Semantic-audit** — `node tools/audit/trigger-integrity.js` → OK (10 инвариантов: 8 из Phase 1/2 + INV-READING-DISCIPLINE + INV-FALLBACK-PROFILE).
- [ ] **State-contract / session-state** — `node tools/audit/state-contract-section.js && node tools/audit/session-state.js` → OK.
- [ ] **Manual smoke read-gate (shadow):** payload Read `docs/architecture/x.md` без limit → stderr `would-deny`, stdout пуст.

---

## Сводка RFC → задачи

| RFC-предложение | Задачи |
|-----------------|--------|
| R7: Read-gate (Reading Discipline §16) | T-01, T-02, T-03 |
| R8: fallback capability profiles + инъекция | T-04, T-05 |
| R9: RGS advisory в CI | T-06, T-07 |

## Вне scope этого PR (Breaking Changes / следующие циклы)

- **RGS hard-fail в CI** (`exit 1` при `RGS < threshold`) — Breaking Change, после стабилизации baseline.
- **Переключение gate'ов (R4 pre-agent, R7 read) из shadow в enforce** — операционное решение после сбора FPR.
- **Auto-detect DEGRADED** для авто-выставления `fallback_for` — отдельный механизм (сейчас выставляет routing-planner вручную).
- **Runtime-метрики RGS** (CCR/FC/RC из §5-истории) — требуют ридера истории feedback-loop.md; отдельная итерация.
- **Reverse trigger-integrity** (claim из CLAUDE.md без manifest) — Phase 3+, шумно.
