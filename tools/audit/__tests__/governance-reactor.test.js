'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const { buildReaction } = require(path.join(root, '.claude/runtime/governance-reactor.js'));
const HOOK = path.join(root, '.claude/runtime/governance-reactor.js');

test('buildReaction: no alerts → empty message, nothing to surface', () => {
  const r = buildReaction({ governance_alerts: [] });
  assert.strictEqual(r.msg, '');
  assert.deepEqual(r.surfacedIdx, []);
});

test('buildReaction: only already-surfaced alerts → empty (anti-spam)', () => {
  const r = buildReaction({ governance_alerts: [
    { kind: 'handoff_decay', ratio: 0.5, surfaced: true },
  ] });
  assert.strictEqual(r.msg, '');
  assert.deepEqual(r.surfacedIdx, []);
});

test('buildReaction: a fresh alert produces a directive and marks its index', () => {
  const r = buildReaction({ governance_alerts: [
    { kind: 'handoff_decay', ratio: 0.5 },
  ] });
  assert.match(r.msg, /GOVERNANCE/i);
  assert.match(r.msg, /handoff/i);
  assert.deepEqual(r.surfacedIdx, [0]);
});

test('buildReaction: mixed surfaced + fresh → only fresh surfaced', () => {
  const r = buildReaction({ governance_alerts: [
    { kind: 'handoff_decay', ratio: 0.5, surfaced: true },
    { kind: 'silent_state_degradation', ssc: 0.5 },
    { kind: 'override_applied', target: 'ccip-dba', reason: 'need it' },
  ] });
  assert.deepEqual(r.surfacedIdx, [1, 2]);
  assert.match(r.msg, /State Update|SSC/i);
  assert.match(r.msg, /override/i);
});

test('buildReaction: unknown alert kind still surfaced with a generic line', () => {
  const r = buildReaction({ governance_alerts: [{ kind: 'some_new_kind' }] });
  assert.deepEqual(r.surfacedIdx, [0]);
  assert.match(r.msg, /some_new_kind/);
});

// ── main (UserPromptSubmit entrypoint) ──────────────────────────────────────────
function writeState(obj) {
  const p = path.join(os.tmpdir(), `gr-state-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(p, JSON.stringify(obj), 'utf-8');
  return p;
}
const promptPayload = JSON.stringify({ hookEventName: 'UserPromptSubmit', prompt: 'hi' });

test('main: emits additionalSystemPrompt for fresh alerts and marks them surfaced', () => {
  const sf = writeState({ session_id: 's', governance_alerts: [{ kind: 'telemetry_blackout', agents: 3 }] });
  try {
    const res = cp.spawnSync(process.execPath, [HOOK], { input: promptPayload, encoding: 'utf-8',
      env: { ...process.env, CCIP_STATE_FILE: sf } });
    assert.strictEqual(res.status, 0);
    const out = JSON.parse(res.stdout);
    assert.match(out.hookSpecificOutput.additionalSystemPrompt, /telemetry|blackout/i);
    const after = JSON.parse(fs.readFileSync(sf, 'utf-8'));
    assert.strictEqual(after.governance_alerts[0].surfaced, true, 'alert marked surfaced after injection');
  } finally { fs.rmSync(sf, { force: true }); }
});

test('main: second run on the same state injects nothing (anti-spam)', () => {
  const sf = writeState({ session_id: 's', governance_alerts: [{ kind: 'telemetry_blackout', agents: 3 }] });
  try {
    cp.spawnSync(process.execPath, [HOOK], { input: promptPayload, encoding: 'utf-8',
      env: { ...process.env, CCIP_STATE_FILE: sf } });
    const res2 = cp.spawnSync(process.execPath, [HOOK], { input: promptPayload, encoding: 'utf-8',
      env: { ...process.env, CCIP_STATE_FILE: sf } });
    assert.strictEqual(res2.stdout.trim(), '', 'no re-injection of already-surfaced alert');
  } finally { fs.rmSync(sf, { force: true }); }
});

test('main: fail-open on malformed stdin (exit 0, no output)', () => {
  const res = cp.spawnSync(process.execPath, [HOOK], { input: 'not-json', encoding: 'utf-8' });
  assert.strictEqual(res.status, 0);
  assert.strictEqual(res.stdout.trim(), '');
});

// ── #9 Wave3: self-governed auto-corrections ──────────────────────────────────

test('#9 buildReaction: selfGoverned=false → correctedKinds empty, no AUTO-REPAIR marker', () => {
  const r = buildReaction({ governance_alerts: [
    { kind: 'state_contract_degraded', agent: 'ccip-architect' },
  ] });
  // correctedKinds must exist in return value (even when selfGoverned=false)
  assert.ok(Array.isArray(r.correctedKinds), 'correctedKinds must always be an array');
  assert.deepEqual(r.correctedKinds, [], 'no auto-corrections in default advisory mode');
  assert.ok(!r.msg.includes('AUTO-REPAIR'), 'no repair marker in advisory-only mode');
});

test('#9 buildReaction: selfGoverned=true + correctable kind → SELF-CORRECTED in msg + correctedKinds', () => {
  const r = buildReaction(
    { governance_alerts: [{ kind: 'state_contract_degraded', agent: 'ccip-architect' }] },
    { selfGoverned: true },
  );
  assert.deepEqual(r.correctedKinds, ['state_contract_degraded']);
  assert.match(r.msg, /SELF-CORRECTED/,   'message must contain SELF-CORRECTED marker');
  assert.match(r.msg, /AUTO-REPAIR/,      'message must contain AUTO-REPAIR repair block');
  assert.match(r.msg, /State Update/,     'repair block must include State Update template reference');
});

test('#9 buildReaction: selfGoverned=true + unknown kind → advisory only, no crash, correctedKinds empty', () => {
  const r = buildReaction(
    { governance_alerts: [{ kind: 'unknown_future_kind_xyz' }] },
    { selfGoverned: true },
  );
  assert.deepEqual(r.correctedKinds, [], 'unknown kinds have no correction entry — advisory only');
  assert.match(r.msg, /unknown_future_kind_xyz/, 'unknown kind still surfaced generically');
  assert.ok(!r.msg.includes('AUTO-REPAIR'), 'no repair marker for unknown kinds');
});
