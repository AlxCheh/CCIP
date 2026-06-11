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

test('offset-only read of a protected path → allow (offset set = not a full read)', () => {
  // D-21 fix: canonical definition (tool-telemetry.js) requires BOTH offset==null AND limit==null
  // to classify as a full read. offset=5 without limit reads tail of file — not a full read.
  const r = evaluateReadGate(readPayload({ file_path: 'docs/architecture/x.md', offset: 5 }),
    { enforce: true });
  assert.strictEqual(r.decision, 'allow');
});

test('subdocs-decoy: path with different prefix does NOT match protected dir', () => {
  // "other-docs/architecture/x.md" must NOT trigger the "docs/architecture/" guard.
  const r = evaluateReadGate(readPayload({ file_path: 'other-docs/architecture/x.md' }),
    { enforce: true });
  assert.strictEqual(r.decision, 'allow');
});

test('non-Read tool → allow', () => {
  const r = evaluateReadGate({ tool_name: 'Bash', tool_input: {} }, { enforce: true });
  assert.strictEqual(r.decision, 'allow');
});

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
  const os = require('node:os');
  const audit = path.join(os.tmpdir(), `rg-audit-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  const state = path.join(os.tmpdir(), `rg-state-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(state, JSON.stringify({ session_id: '2026-01-01-1200', governance_alerts: [] }), 'utf-8');
  try {
    const res = cp.spawnSync(process.execPath, [HOOK], { input: 'not-json', encoding: 'utf-8',
      env: { ...process.env, CCIP_GOV_AUDIT_FILE: audit, CCIP_STATE_FILE: state } });
    assert.strictEqual(res.status, 0, 'still fail-open (exit 0)');
    assert.strictEqual(res.stdout.trim(), '', 'no deny emitted');
    // E-6: the fail-open is now observable
    const lines = fs.readFileSync(audit, 'utf-8').trim().split('\n').filter(Boolean).map(JSON.parse);
    assert.strictEqual(lines[0].kind, 'gate_failed_open');
    assert.strictEqual(lines[0].gate, 'read-gate');
    assert.strictEqual(lines[0].phase, 'parse', 'malformed payload → parse phase');
    const st = JSON.parse(fs.readFileSync(state, 'utf-8'));
    assert.ok(st.governance_alerts.some(a => a.kind === 'gate_failed_open'), 'state alert pushed for reactor');
  } finally {
    fs.rmSync(audit, { force: true });
    fs.rmSync(state, { force: true });
  }
});

// E-4: case-insensitive match — Windows FS is case-insensitive, so docs/Architecture/
// resolves to the SAME protected file as docs/architecture/. Prefix match must not be
// case-sensitive or the discipline is bypassable by changing case.
test('E-4: capitalised protected dir (docs/Architecture/) full read → deny', () => {
  const r = evaluateReadGate(readPayload({ file_path: 'docs/Architecture/architecture_v1_0.md' }),
    { enforce: true });
  assert.strictEqual(r.decision, 'deny');
});

test('E-4: mixed-case .CLAUDE/Agents/ full read → deny', () => {
  const r = evaluateReadGate(readPayload({ file_path: '.CLAUDE/Agents/ccip-architect.md' }),
    { enforce: true });
  assert.strictEqual(r.decision, 'deny');
});

// E-5: a huge explicit limit loads the whole file but slipped past the gate, which only
// checked for the PRESENCE of limit, not its magnitude. A limit beyond the discipline cap
// is a full read in disguise.
test('E-5: protected path + huge limit (9999999) → deny', () => {
  const r = evaluateReadGate(readPayload({ file_path: 'docs/architecture/x.md', limit: 9999999 }),
    { enforce: true, maxLines: 2000 });
  assert.strictEqual(r.decision, 'deny');
});

test('E-5: protected path + limit at cap (2000) → allow', () => {
  const r = evaluateReadGate(readPayload({ file_path: 'docs/architecture/x.md', limit: 2000 }),
    { enforce: true, maxLines: 2000 });
  assert.strictEqual(r.decision, 'allow');
});

test('E-5: protected path + limit just over cap (2001) → deny', () => {
  const r = evaluateReadGate(readPayload({ file_path: 'docs/architecture/x.md', limit: 2001 }),
    { enforce: true, maxLines: 2000 });
  assert.strictEqual(r.decision, 'deny');
});

test('E-5: non-protected path + huge limit → allow (gate only guards protected dirs)', () => {
  const r = evaluateReadGate(readPayload({ file_path: 'README.md', limit: 9999999 }),
    { enforce: true, maxLines: 2000 });
  assert.strictEqual(r.decision, 'allow');
});
