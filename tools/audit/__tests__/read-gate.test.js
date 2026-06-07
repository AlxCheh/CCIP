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
