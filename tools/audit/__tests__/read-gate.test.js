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
  const res = cp.spawnSync(process.execPath, [HOOK], { input: 'not-json', encoding: 'utf-8' });
  assert.strictEqual(res.status, 0);
  assert.strictEqual(res.stdout.trim(), '');
});
