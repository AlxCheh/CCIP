'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();
const { buildInjection } = require(path.join(root, '.claude/runtime/contract-debt-injector.js'));
const HOOK = path.join(root, '.claude/runtime/contract-debt-injector.js');

// ── pure function ──────────────────────────────────────────────────────────────

test('buildInjection returns empty string when debt is 0', () => {
  assert.strictEqual(buildInjection({ contract_debt: 0 }), '');
  assert.strictEqual(buildInjection({}), '');
});

test('buildInjection returns reminder when debt > 0', () => {
  const msg = buildInjection({ contract_debt: 2 });
  assert.ok(msg.length > 0);
  assert.match(msg, /State Update|contract_debt/i);
  assert.match(msg, /2/); // mentions the count
});

// ── main() ────────────────────────────────────────────────────────────────────

function writeTmpState(obj) {
  const p = path.join(os.tmpdir(), `cdi-state-${Date.now()}.json`);
  fs.writeFileSync(p, JSON.stringify(obj), 'utf-8');
  return p;
}

test('main: emits additionalSystemPrompt when contract_debt > 0', () => {
  const stateFile = writeTmpState({
    session_id: 's', contract_debt: 3, observations: [], dag: [],
  });
  try {
    const res = cp.spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ prompt: 'hello' }), encoding: 'utf-8',
      env: { ...process.env, CCIP_STATE_FILE: stateFile },
    });
    assert.strictEqual(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout);
    assert.ok(out.hookSpecificOutput.additionalSystemPrompt.length > 0);
    assert.match(out.hookSpecificOutput.additionalSystemPrompt, /State Update|contract_debt/i);
  } finally { fs.rmSync(stateFile, { force: true }); }
});

test('main: emits no output when contract_debt is 0', () => {
  const stateFile = writeTmpState({ session_id: 's', contract_debt: 0 });
  try {
    const res = cp.spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ prompt: 'hello' }), encoding: 'utf-8',
      env: { ...process.env, CCIP_STATE_FILE: stateFile },
    });
    assert.strictEqual(res.status, 0);
    assert.strictEqual(res.stdout.trim(), '');
  } finally { fs.rmSync(stateFile, { force: true }); }
});

test('main: fail-open when state file missing', () => {
  const res = cp.spawnSync(process.execPath, [HOOK], {
    input: '{}', encoding: 'utf-8',
    env: { ...process.env, CCIP_STATE_FILE: '/nonexistent/state.json' },
  });
  assert.strictEqual(res.status, 0);
  assert.strictEqual(res.stdout.trim(), '');
});

test('main: fail-open on malformed stdin', () => {
  const res = cp.spawnSync(process.execPath, [HOOK], { input: 'bad json', encoding: 'utf-8' });
  assert.strictEqual(res.status, 0);
  assert.strictEqual(res.stdout.trim(), '');
});

// ── wiring ────────────────────────────────────────────────────────────────────

test('contract-debt-injector is registered as a UserPromptSubmit hook', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf-8'));
  const hooks = (settings.hooks.UserPromptSubmit || []).flatMap(b => b.hooks.map(h => h.command));
  assert.ok(hooks.some(c => /contract-debt-injector\.js/.test(c)),
    'UserPromptSubmit must include contract-debt-injector.js');
});
