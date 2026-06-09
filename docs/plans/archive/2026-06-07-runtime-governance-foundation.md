# Runtime Governance Foundation (R1+R2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Первый имплементационный PR по RFC «Machine-Enforced Runtime Governance». Заложить два фундаментных plane, разблокирующих остальные фазы:
- **R1 — Semantic plane:** `governance-manifest.json` (single source of truth для runtime-инвариантов) + audit `trigger-integrity.js`, доказывающий, что каждый задекларированный инвариант имеет реальный enforcement/doc anchor.
- **R2 — Telemetry plane:** `tool-telemetry.js` (PostToolUse на всех инструментах) → `events.jsonl`, дающий телеметрию inline-сессий (Read/Edit/Bash), которой сегодня нет.

**Architecture:** Оба аддитивны — новые файлы, существующие хуки/схемы не ломаются. Enforcement в этом PR НЕ вводится (нет `deny`) — только наблюдаемость и semantic-проверка. Это снимает риск false-positive deny на старте.

**Tech Stack:** Node.js 20+ (`node:test`, `node:assert`, `node:child_process`), JSON Schema draft-2020-12, тест-раннер `tools/audit/run-tests.js`, governance `tools/audit/audit-suite.js`.

**Spec:** `docs/plans/specs/2026-06-07-machine-enforced-runtime-governance-design.md` (§6 Semantic Governance, §7 Telemetry, §12 R1/R2)

**Closes gap:** `docs/tasks/runtime-enforcement-design-gap.md` (F-RT-05) — первый шаг.

---

## Принципы этого PR (инварианты дизайна)

1. **Никакого `deny`.** R1/R2 только наблюдают и валидируют. Блокирующий enforcement (pre-agent-gate) — Phase 2, отдельный PR.
2. **Fail-open.** Любой новый хук при внутренней ошибке завершается `exit 0` + stderr (паттерн `post-agent-hook.js`). Governance не должна ронять сессию.
3. **Anchor = substring-маркер.** `enforcement` в manifest указывает на `file#MARKER`, где `MARKER` — комментарий-маркер в коде. Audit проверяет подстроку (дёшево, reuse fs).
4. **Seed только реальное.** В manifest на этом PR попадают ТОЛЬКО инварианты с уже существующим enforcement (State Update наблюдаемость из ADR-017 + telemetry из R2). Никаких ссылок на ненаписанный pre-agent-gate.
5. **events.jsonl — append-only, gitignored, с ротацией по размеру.** Не коммитим телеметрию.

---

## Файлы, затронутые планом

| Файл | Задача | Тип |
|------|--------|-----|
| `docs/schemas/governance-manifest.schema.json` | T-01 | Create |
| `.claude/runtime/governance-manifest.json` | T-01 | Create — seed-инварианты |
| `tools/audit/__tests__/governance-manifest.test.js` | T-01 | Create |
| `.claude/runtime/post-agent-hook.js` | T-02 | Modify — маркер `[INV-STATE-CONTRACT]` |
| `.claude/runtime/execute-dag.js` | T-02 | Modify — маркер `[INV-STATE-CONTRACT-DAG]` |
| `.claude/runtime/flush-state.js` | T-02 | Modify — маркер `[INV-OBSERVABILITY-ROLLUP]` |
| `tools/audit/trigger-integrity.js` | T-03 | Create — semantic audit |
| `tools/audit/__tests__/trigger-integrity.test.js` | T-03 | Create |
| `tools/audit/audit-suite.js` | T-04 | Modify — wire-in |
| `docs/schemas/event.schema.json` | T-05 | Create — per-line event |
| `.claude/runtime/tool-telemetry.js` | T-05,T-06 | Create — PostToolUse[*] |
| `tools/audit/__tests__/tool-telemetry.test.js` | T-05,T-06 | Create |
| `.gitignore` | T-06 | Modify — `events.jsonl` |
| `.claude/settings.json` | T-07 | Modify — register PostToolUse hook |
| `.claude/runtime/governance-manifest.json` | T-07 | Modify — add `INV-TOOL-TELEMETRY` |

> **Перед стартом T-07:** подтвердить реальный файл wiring хуков (`.claude/settings.json` vs другой) через Read — НЕ предполагать.

---

## R1 — Semantic Governance Plane

## Task 01: governance-manifest — схема + seed

**Files:**
- Create: `docs/schemas/governance-manifest.schema.json`
- Create: `.claude/runtime/governance-manifest.json`
- Create: `tools/audit/__tests__/governance-manifest.test.js`

- [ ] **Step 1: Failing-тест (контракт схемы + валидность seed)**

`tools/audit/__tests__/governance-manifest.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Ajv = require('ajv'); // если уже используется в audit; иначе — ручная проверка структуры
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const schema = require(path.join(root, 'docs/schemas/governance-manifest.schema.json'));
const manifest = require(path.join(root, '.claude/runtime/governance-manifest.json'));

test('manifest schema requires id/claim/doc_anchor/enforcement/kind/status', () => {
  const req = schema.properties.invariants.items.required;
  for (const f of ['id', 'claim', 'doc_anchor', 'enforcement', 'kind', 'status'])
    assert.ok(req.includes(f), `${f} must be required`);
});

test('seed manifest validates against schema (structure + enums)', () => {
  const items = schema.properties.invariants.items;
  assert.ok(Array.isArray(manifest.invariants) && manifest.invariants.length >= 1);
  for (const inv of manifest.invariants) {
    assert.ok(items.properties.kind.enum.includes(inv.kind), `bad kind: ${inv.kind}`);
    assert.match(inv.enforcement, /^[\w.-]+#[\w-]+$/, 'enforcement = file#MARKER');
  }
});
```
> Если `ajv` не подключён в audit — заменить на структурные ассерты без него (репо использует свои чекеры). Сверить с `tools/audit/_lib/`.

- [ ] **Step 2: Красный** — `node tools/audit/run-tests.js 2>&1 | grep -A3 "manifest schema requires"` → FAIL (файлов нет).

- [ ] **Step 3: Создать схему** `docs/schemas/governance-manifest.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ccip.local/schemas/governance-manifest.json",
  "title": "CCIP Governance Manifest",
  "type": "object",
  "required": ["invariants"],
  "properties": {
    "invariants": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "claim", "doc_anchor", "enforcement", "kind", "status"],
        "properties": {
          "id":          { "type": "string", "pattern": "^INV-[A-Z0-9-]+$" },
          "claim":       { "type": "string" },
          "doc_anchor":  { "type": "string" },
          "enforcement": { "type": "string", "pattern": "^[\\w.-]+#[\\w-]+$" },
          "kind":        { "type": "string", "enum": ["block", "signal", "advisory"] },
          "telemetry":   { "type": "string" },
          "status":      { "type": "string", "enum": ["enforced", "observed", "advisory", "planned"] }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

- [ ] **Step 4: Создать seed-manifest** `.claude/runtime/governance-manifest.json` (только РЕАЛЬНЫЕ инварианты):
```json
{
  "invariants": [
    {
      "id": "INV-STATE-CONTRACT",
      "claim": "agent MUST end with ## State Update; пропуск помечается missing_state_update",
      "doc_anchor": "§15",
      "enforcement": "post-agent-hook.js#INV-STATE-CONTRACT",
      "kind": "signal",
      "status": "observed"
    },
    {
      "id": "INV-STATE-CONTRACT-DAG",
      "claim": "autonomous DAG writer flags missing ## State Update identically",
      "doc_anchor": "§15",
      "enforcement": "execute-dag.js#INV-STATE-CONTRACT-DAG",
      "kind": "signal",
      "status": "observed"
    },
    {
      "id": "INV-OBSERVABILITY-ROLLUP",
      "claim": "Stop-time rollup surfaces agents that missed the block",
      "doc_anchor": "§15",
      "enforcement": "flush-state.js#INV-OBSERVABILITY-ROLLUP",
      "kind": "signal",
      "status": "observed"
    }
  ]
}
```

- [ ] **Step 5: Зелёный** — `node tools/audit/run-tests.js 2>&1 | grep -A1 "seed manifest validates"` → PASS.

- [ ] **Step 6: Commit**
```bash
git add docs/schemas/governance-manifest.schema.json .claude/runtime/governance-manifest.json tools/audit/__tests__/governance-manifest.test.js
git commit -m "feat(governance): seed manifest + schema — runtime invariants source of truth (RFC R1)"
```

---

## Task 02: маркеры enforcement-anchor в коде

**Files:** Modify `.claude/runtime/{post-agent-hook,execute-dag,flush-state}.js`

> Маркер = комментарий рядом с реальной логикой инварианта. `trigger-integrity` (T-03) проверит его наличие подстрокой. Никакой логики не меняем.

- [ ] **Step 1:** В `post-agent-hook.js` рядом с `const missingBlock = parsed === null;` добавить:
```js
  // [INV-STATE-CONTRACT] ADR-017 — observability of missing ## State Update
```

- [ ] **Step 2:** В `execute-dag.js` в `applyStepResult`, рядом с `if (upd === null)`:
```js
    // [INV-STATE-CONTRACT-DAG] ADR-017 — DAG-writer parity
```

- [ ] **Step 3:** В `flush-state.js` рядом с `const missing = kept.filter(...)`:
```js
  // [INV-OBSERVABILITY-ROLLUP] ADR-017 — Stop-time rollup
```

- [ ] **Step 4: Регрессия** — `node tools/audit/run-tests.js 2>&1 | grep -iE "fail [0-9]+"` → `fail 0` (комментарии не ломают поведение).

- [ ] **Step 5: Commit**
```bash
git add .claude/runtime/post-agent-hook.js .claude/runtime/execute-dag.js .claude/runtime/flush-state.js
git commit -m "chore(governance): enforcement-anchor markers for manifest invariants (RFC R1)"
```

---

## Task 03: trigger-integrity.js — semantic audit

**Files:**
- Create: `tools/audit/trigger-integrity.js`
- Create: `tools/audit/__tests__/trigger-integrity.test.js`

**Контракт audit (forward-валидация, low-FPR):** для каждого инварианта manifest —
(a) `doc_anchor` встречается в `CLAUDE.md`; (b) файл из `enforcement` существует в `.claude/runtime/`; (c) маркер (часть после `#`) встречается в этом файле. Любое нарушение → exit 1 + причина. Reverse-направление (claim из CLAUDE.md без manifest) — НЕ в этом PR (шумно), вынесено в Phase 3.

- [ ] **Step 1: Failing-тест** `tools/audit/__tests__/trigger-integrity.test.js`:
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
const AUDIT = path.join(root, 'tools/audit/trigger-integrity.js');

test('trigger-integrity passes on the real repo manifest', () => {
  const res = cp.spawnSync(process.execPath, [AUDIT], { encoding: 'utf-8', cwd: root });
  assert.strictEqual(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /\[TRIGGER-INTEGRITY\] OK/);
});

test('trigger-integrity fails when an enforcement marker is missing', () => {
  // Указываем на временный manifest с битым anchor через env-override.
  const tmp = path.join(os.tmpdir(), `manifest-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ invariants: [{
    id: 'INV-FAKE', claim: 'x', doc_anchor: '§15',
    enforcement: 'post-agent-hook.js#INV-DOES-NOT-EXIST',
    kind: 'signal', status: 'observed' }] }), 'utf-8');
  try {
    const res = cp.spawnSync(process.execPath, [AUDIT],
      { encoding: 'utf-8', cwd: root, env: { ...process.env, CCIP_MANIFEST_FILE: tmp } });
    assert.notStrictEqual(res.status, 0, 'must fail on missing marker');
    assert.match(res.stdout + res.stderr, /INV-DOES-NOT-EXIST|marker/i);
  } finally { fs.rmSync(tmp, { force: true }); }
});
```

- [ ] **Step 2: Красный** — `node tools/audit/run-tests.js 2>&1 | grep -A2 "trigger-integrity passes"` → FAIL (нет файла).

- [ ] **Step 3: Реализовать** `tools/audit/trigger-integrity.js`:
```js
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { gitRoot } = require('./_lib/git-root');

const root = gitRoot();
const MANIFEST = process.env.CCIP_MANIFEST_FILE
  || path.join(root, '.claude/runtime/governance-manifest.json');
const CLAUDE_MD = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');
const RUNTIME = path.join(root, '.claude/runtime');

function fail(msg) { console.log(`[TRIGGER-INTEGRITY] FAIL: ${msg}`); process.exit(1); }

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));
for (const inv of manifest.invariants) {
  // (a) doc_anchor in CLAUDE.md
  if (!CLAUDE_MD.includes(inv.doc_anchor))
    fail(`${inv.id}: doc_anchor "${inv.doc_anchor}" not found in CLAUDE.md`);
  // (b)+(c) enforcement file + marker
  const [file, marker] = inv.enforcement.split('#');
  const p = path.join(RUNTIME, file);
  if (!fs.existsSync(p)) fail(`${inv.id}: enforcement file missing — ${file}`);
  if (!fs.readFileSync(p, 'utf-8').includes(marker))
    fail(`${inv.id}: marker "${marker}" not found in ${file}`);
}
console.log('[TRIGGER-INTEGRITY] OK');
process.exit(0);
```

- [ ] **Step 4: Зелёный** — оба теста PASS; вручную `node tools/audit/trigger-integrity.js` → `[TRIGGER-INTEGRITY] OK`.

- [ ] **Step 5: Commit**
```bash
git add tools/audit/trigger-integrity.js tools/audit/__tests__/trigger-integrity.test.js
git commit -m "feat(governance): trigger-integrity semantic audit — manifest vs code/doc anchors (RFC R1)"
```

---

## Task 04: wire trigger-integrity в audit-suite

**Files:** Modify `tools/audit/audit-suite.js`

- [ ] **Step 1:** Прочитать `audit-suite.js` (offset по разделу `§10.x`), найти, как регистрируются чеки (паттерн вызова + счётчик `N/M`).

- [ ] **Step 2:** Добавить `trigger-integrity.js` в раздел semantic integrity (новый `§10.x` или к §10.1). Следовать существующему паттерну регистрации.

- [ ] **Step 3: Smoke** — `node tools/audit/audit-suite.js 2>&1 | grep -E "TRIGGER-INTEGRITY|Summary"`
Expected: `[TRIGGER-INTEGRITY] OK` и обновлённый `Summary: 20/20 passed` (было 19/19).

- [ ] **Step 4:** Если в audit-suite есть тест на ожидаемое число чеков — обновить.

- [ ] **Step 5: Commit**
```bash
git add tools/audit/audit-suite.js
git commit -m "feat(governance): register trigger-integrity in audit-suite (RFC R1)"
```

---

## R2 — Telemetry Plane

## Task 05: event-схема + tool-telemetry pure helpers

**Files:**
- Create: `docs/schemas/event.schema.json`
- Create: `.claude/runtime/tool-telemetry.js` (экспорт чистых хелперов)
- Create: `tools/audit/__tests__/tool-telemetry.test.js`

- [ ] **Step 1: Failing-тест на чистые хелперы** (поведенческие, §17):
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();
const { extractTarget, isFullRead, buildEvent } =
  require(path.join(root, '.claude/runtime/tool-telemetry.js'));

test('isFullRead true when Read has no offset/limit', () => {
  assert.strictEqual(isFullRead({ tool_name: 'Read', tool_input: { file_path: 'a.md' } }), true);
  assert.strictEqual(isFullRead({ tool_name: 'Read', tool_input: { file_path: 'a.md', limit: 10 } }), false);
  assert.strictEqual(isFullRead({ tool_name: 'Bash', tool_input: { command: 'ls' } }), false);
});

test('extractTarget returns file path or command head', () => {
  assert.strictEqual(extractTarget({ tool_name: 'Read', tool_input: { file_path: '/x/a.md' } }), '/x/a.md');
  assert.match(extractTarget({ tool_name: 'Bash', tool_input: { command: 'node foo.js --bar' } }), /^node foo\.js/);
});

test('buildEvent shape conforms to schema fields', () => {
  const ev = buildEvent({ tool_name: 'Read', tool_input: { file_path: 'a.md' },
    tool_response: { content: 'x' } }, 'sess-1');
  for (const k of ['ts', 'session', 'tool', 'target', 'bytes', 'full_read', 'outcome'])
    assert.ok(k in ev, `event missing ${k}`);
  assert.strictEqual(ev.session, 'sess-1');
  assert.strictEqual(ev.outcome, 'ok');
});
```

- [ ] **Step 2: Красный** — FAIL (нет модуля).

- [ ] **Step 3: Создать схему** `docs/schemas/event.schema.json` (per-line):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ccip.local/schemas/event.json",
  "title": "CCIP Tool Telemetry Event",
  "type": "object",
  "required": ["ts", "session", "tool", "outcome"],
  "properties": {
    "ts":        { "type": "string" },
    "session":   { "type": "string" },
    "tool":      { "type": "string" },
    "target":    { "type": "string" },
    "bytes":     { "type": "integer", "minimum": 0 },
    "full_read": { "type": "boolean" },
    "outcome":   { "type": "string", "enum": ["ok", "error"] }
  },
  "additionalProperties": false
}
```

- [ ] **Step 4: Реализовать хелперы** в `tool-telemetry.js` (только pure-функции + `module.exports`; main-часть в T-06):
```js
'use strict';
function isFullRead(p) {
  if (p.tool_name !== 'Read') return false;
  const i = p.tool_input || {};
  return i.offset == null && i.limit == null;
}
function extractTarget(p) {
  const i = p.tool_input || {};
  if (i.file_path) return String(i.file_path);
  if (i.command) return String(i.command).slice(0, 80);
  if (i.pattern) return String(i.pattern).slice(0, 80);
  return '';
}
function buildEvent(p, session) {
  const text = JSON.stringify(p.tool_response || '');
  return {
    ts: new Date().toISOString(), session: session || '',
    tool: p.tool_name || '', target: extractTarget(p),
    bytes: Buffer.byteLength(text, 'utf-8'),
    full_read: isFullRead(p),
    outcome: p.tool_response?.is_error ? 'error' : 'ok',
  };
}
module.exports = { isFullRead, extractTarget, buildEvent };
```

- [ ] **Step 5: Зелёный** — три теста PASS.

- [ ] **Step 6: Commit**
```bash
git add docs/schemas/event.schema.json .claude/runtime/tool-telemetry.js tools/audit/__tests__/tool-telemetry.test.js
git commit -m "feat(telemetry): event schema + tool-telemetry pure helpers (RFC R2)"
```

---

## Task 06: tool-telemetry hook (append events.jsonl + rotation)

**Files:** Modify `.claude/runtime/tool-telemetry.js`, `.gitignore`, add tests

- [ ] **Step 1: Failing-тест на end-to-end** (spawn с stdin payload, как в `post-agent-hook.test.js`):
```js
test('hook appends one JSONL line per tool call into CCIP_EVENTS_FILE', () => {
  const tmp = path.join(os.tmpdir(), `events-${Date.now()}.jsonl`);
  const payload = JSON.stringify({ tool_name: 'Read',
    tool_input: { file_path: 'a.md' }, tool_response: { content: 'x' } });
  cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8',
    env: { ...process.env, CCIP_EVENTS_FILE: tmp } });
  const lines = fs.readFileSync(tmp, 'utf-8').trim().split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 1);
  const ev = JSON.parse(lines[0]);
  assert.strictEqual(ev.tool, 'Read');
  assert.strictEqual(ev.full_read, true);
  fs.rmSync(tmp, { force: true });
});

test('hook is fail-open on malformed payload (exit 0, no throw)', () => {
  const res = cp.spawnSync(process.execPath, [HOOK], { input: 'not-json', encoding: 'utf-8' });
  assert.strictEqual(res.status, 0);
});
```
> `HOOK = path.join(root, '.claude/runtime/tool-telemetry.js')`.

- [ ] **Step 2: Красный** — FAIL (нет main-части).

- [ ] **Step 3: Добавить main** в `tool-telemetry.js` (stdin → append; fail-open; ротация по размеру):
```js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const EVENTS = process.env.CCIP_EVENTS_FILE
  || path.join(ROOT, '.claude/runtime/events.jsonl');
const STATE = path.join(ROOT, '.claude/runtime/session-state.json');
const MAX_BYTES = 5 * 1024 * 1024;

function sessionId() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf-8')).session_id || ''; }
  catch { return ''; }
}
function rotate() {
  try { if (fs.statSync(EVENTS).size > MAX_BYTES) fs.renameSync(EVENTS, EVENTS + '.1'); }
  catch {}
}
if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', c => { raw += c; });
  process.stdin.on('end', () => {
    try {
      const p = JSON.parse(raw);
      rotate();
      fs.appendFileSync(EVENTS, JSON.stringify(buildEvent(p, sessionId())) + '\n', 'utf-8');
    } catch (e) {
      process.stderr.write(`[tool-telemetry] ${e.message}\n`);
    }
    process.exit(0); // fail-open
  });
}
```

- [ ] **Step 4:** Добавить в `.gitignore`:
```
.claude/runtime/events.jsonl
.claude/runtime/events.jsonl.1
```

- [ ] **Step 5: Зелёный** — оба теста PASS; `fail 0` в полном прогоне.

- [ ] **Step 6: Commit**
```bash
git add .claude/runtime/tool-telemetry.js tools/audit/__tests__/tool-telemetry.test.js .gitignore
git commit -m "feat(telemetry): tool-telemetry hook — append events.jsonl, fail-open, rotation (RFC R2)"
```

---

## Task 07: зарегистрировать хук + manifest-запись

**Files:** Modify `.claude/settings.json`, `.claude/runtime/governance-manifest.json`

- [ ] **Step 1:** Read `.claude/settings.json` — подтвердить реальную структуру `hooks` (как зарегистрированы `post-agent-hook`/`flush-state`). НЕ предполагать имя файла.

- [ ] **Step 2:** Зарегистрировать `tool-telemetry.js` как `PostToolUse` matcher на все инструменты (`matcher: "*"` или эквивалент по факту схемы settings). Сохранить существующий `PostToolUse[Agent]` (post-agent-hook) — добавить, не заменить.

- [ ] **Step 3:** Добавить маркер `// [INV-TOOL-TELEMETRY]` в `tool-telemetry.js` (рядом с `appendFileSync`) и запись в manifest:
```json
{
  "id": "INV-TOOL-TELEMETRY",
  "claim": "every tool call emits a telemetry event (inline-session coverage)",
  "doc_anchor": "§15",
  "enforcement": "tool-telemetry.js#INV-TOOL-TELEMETRY",
  "kind": "signal",
  "telemetry": "events.jsonl:tool_use",
  "status": "observed"
}
```
> `doc_anchor` временно `§15` — в Phase 2 при добавлении §-секции про телеметрию заменить на точный anchor.

- [ ] **Step 4: Зелёный** — `node tools/audit/trigger-integrity.js` → OK (новый инвариант резолвится); `node tools/audit/audit-suite.js | grep Summary` → 20/20.

- [ ] **Step 5: Commit**
```bash
git add .claude/settings.json .claude/runtime/governance-manifest.json .claude/runtime/tool-telemetry.js
git commit -m "feat(telemetry): register PostToolUse[*] hook + manifest entry (RFC R2)"
```

---

## Финальная проверка

- [ ] **Полный тест-сьют** — `node tools/audit/run-tests.js 2>&1 | grep -E "pass [0-9]+|fail [0-9]+"` → `fail 0`.
- [ ] **Полный audit-suite** — `node tools/audit/audit-suite.js 2>&1 | tail -2` → `Summary: 20/20 passed`.
- [ ] **State-contract цел** — `node tools/audit/state-contract-section.js` → OK (комментарии-маркеры §15-логику не сломали).
- [ ] **Manual smoke телеметрии** — один реальный Read в сессии создаёт строку в `events.jsonl`.

---

## Сводка RFC → задачи

| RFC-предложение | Задачи |
|-----------------|--------|
| R1: governance-manifest (source of truth) | T-01 |
| R1: enforcement-anchor маркеры | T-02 |
| R1: trigger-integrity semantic audit | T-03, T-04 |
| R2: event-схема + tool-telemetry хелперы | T-05 |
| R2: PostToolUse[*] хук + events.jsonl | T-06, T-07 |

## Вне scope этого PR (следующие фазы)

- `pre-agent-gate` (deny budget/co-agent) — Phase 2, отдельный PR (вводит блокирующий enforcement).
- `aggregate-telemetry` на Stop + inline FC-метрика — Phase 2 (R5).
- Reverse-direction trigger-integrity (claim из CLAUDE.md без manifest) — Phase 3 (шумно).
- fallback capability profiles — Phase 3 (R8).
- RGS в CI — Phase 3 (R9).
