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
  const r = evaluateGate({ risk: 'LOW', agent_outputs: { 'a': {} } }, agentPayload(), { maxAgents: 3 });
  assert.strictEqual(r.decision, 'allow');
});

test('budget reached + enforce → deny', () => {
  const state = { risk: 'LOW', agent_outputs: { 'a': {}, 'b': {}, 'c': {} }, dag: [] };
  const r = evaluateGate(state, agentPayload(), { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'deny');
  assert.match(r.reason, /budget/i);
});

test('budget reached + shadow (default) → allow but flags wouldDeny', () => {
  const state = { risk: 'LOW', agent_outputs: { 'a': {}, 'b': {}, 'c': {} }, dag: [] };
  const r = evaluateGate(state, agentPayload(), { enforce: false, maxAgents: 3 });
  assert.strictEqual(r.decision, 'allow');
  assert.strictEqual(r.wouldDeny, true);
});

test('E-1: budget reached + override reason string → allow, overridden, budget bypassed', () => {
  const state = { risk: 'LOW', agent_outputs: { 'a': {}, 'b': {}, 'c': {} }, dag: [] };
  const r = evaluateGate(state, agentPayload({ override: 'pilot needs a 4th agent' }), { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'allow');
  assert.strictEqual(r.overridden, true);
  assert.strictEqual(r.overrideReason, 'pilot needs a 4th agent');
  assert.ok(Array.isArray(r.bypassed) && /budget/i.test(r.bypassed.join(' ')));
});

test('E-1: budget reached + override:true (boolean) → still denied (justification string required)', () => {
  const state = { risk: 'LOW', agent_outputs: { 'a': {}, 'b': {}, 'c': {} }, dag: [] };
  const r = evaluateGate(state, agentPayload({ override: true }), { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'deny');
  assert.notStrictEqual(r.overridden, true);
});

test('E-1: budget reached + override empty string → still denied', () => {
  const state = { risk: 'LOW', agent_outputs: { 'a': {}, 'b': {}, 'c': {} }, dag: [] };
  const r = evaluateGate(state, agentPayload({ override: '   ' }), { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'deny');
});

test('E-1: security violation + override reason → STILL denied (security never waivable)', () => {
  const state = { risk: 'HIGH', intents: ['SECURITY'], observations: [], dag: [], agent_outputs: {} };
  const r = evaluateGate(state, agentPayload({ override: 'I accept the risk' }), { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'deny');
  assert.match(r.reason, /security-reviewer/i);
});

test('E-1: budget+security both violated + override → budget bypassed but security keeps deny', () => {
  const state = { risk: 'HIGH', intents: ['SECURITY'], observations: [],
    agent_outputs: { 'a': {}, 'b': {}, 'c': {} }, dag: [] };
  const r = evaluateGate(state, agentPayload({ override: 'need more hands' }), { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'deny');
  assert.match(r.reason, /security-reviewer/i);
  assert.ok(!/budget/i.test(r.reason), 'budget must be bypassed, only security remains in deny reason');
  assert.ok(Array.isArray(r.bypassed) && /budget/i.test(r.bypassed.join(' ')));
});

test('E-1: overrideDisabled opt → override ignored, budget deny stands', () => {
  const state = { risk: 'LOW', agent_outputs: { 'a': {}, 'b': {}, 'c': {} }, dag: [] };
  const r = evaluateGate(state, agentPayload({ override: 'valid reason' }),
    { enforce: true, maxAgents: 3, overrideDisabled: true });
  assert.strictEqual(r.decision, 'deny');
  assert.notStrictEqual(r.overridden, true);
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

// D-19: SECURITY_RE must also check DAG step scope, not only subagent_type
test('HIGH risk + auth scope in DAG step + no security-reviewer → deny', () => {
  const state = {
    risk: 'HIGH',
    intents: ['BACKEND'],
    observations: [],
    dag: [{ agent: 'ccip-backend-core', scope: 'implement JWT auth guards for RBAC' }],
    agent_outputs: {},
  };
  const payload = { tool_name: 'Agent', tool_input: { subagent_type: 'ccip-backend-core' } };
  const r = evaluateGate(state, payload, { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'deny',
    'HIGH risk + auth in DAG scope must require security-reviewer');
  assert.match(r.reason, /security-reviewer/i);
});

test('non-Agent payload → allow (gate is Agent-only)', () => {
  const r = evaluateGate({ risk: 'HIGH' }, { tool_name: 'Bash', tool_input: {} }, { enforce: true });
  assert.strictEqual(r.decision, 'allow');
});

// D-10: budget must use agent_outputs (persists through flush), not observations (cleared at Stop)
test('budget uses agent_outputs count, not observations length', () => {
  const state = {
    risk: 'LOW',
    observations: [],
    dag: [],
    agent_outputs: { 'ccip-architect': {}, 'ccip-dba': {} },
  };
  const r = evaluateGate(state, agentPayload(), { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'allow');
});

test('budget uses agent_outputs: deny when 3 agents already in agent_outputs', () => {
  const state = {
    risk: 'LOW',
    observations: [],
    dag: [],
    agent_outputs: { 'ccip-architect': {}, 'ccip-dba': {}, 'ccip-frontend': {} },
  };
  const r = evaluateGate(state, agentPayload(), { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'deny');
  assert.match(r.reason, /budget/i);
});

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
    agent_outputs: { 'a': {}, 'b': {}, 'c': {} }, dag: [] });
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
    agent_outputs: { 'a': {}, 'b': {}, 'c': {} }, dag: [] });
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

test('E-1 main: override applied writes a durable governance-audit.jsonl line', () => {
  const stateFile = writeTmpState({ session_id: 'sess-ov', risk: 'LOW',
    agent_outputs: { 'a': {}, 'b': {}, 'c': {} }, dag: [] });
  const auditFile = path.join(os.tmpdir(), `gov-audit-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  const payload = JSON.stringify({ tool_name: 'Agent',
    tool_input: { subagent_type: 'ccip-dba', override: 'pilot needs 4th agent' } });
  try {
    const res = cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8',
      env: { ...process.env, CCIP_GATE_ENFORCE: '1', CCIP_STATE_FILE: stateFile, CCIP_GOV_AUDIT_FILE: auditFile } });
    assert.strictEqual(res.status, 0);
    assert.strictEqual(res.stdout.trim(), '', 'override must allow (no deny output)');
    const lines = fs.readFileSync(auditFile, 'utf-8').trim().split('\n').filter(Boolean).map(JSON.parse);
    assert.strictEqual(lines.length, 1);
    assert.strictEqual(lines[0].kind, 'override_applied');
    assert.strictEqual(lines[0].session, 'sess-ov');
    assert.strictEqual(lines[0].reason, 'pilot needs 4th agent');
    assert.match(lines[0].bypassed.join(' '), /budget/i);
  } finally {
    fs.rmSync(stateFile, { force: true });
    fs.rmSync(auditFile, { force: true });
  }
});

test('E-1 main: rejected security override writes override_rejected audit + still denies', () => {
  const stateFile = writeTmpState({ session_id: 'sess-rej', risk: 'HIGH', intents: ['SECURITY'],
    observations: [], agent_outputs: {}, dag: [] });
  const auditFile = path.join(os.tmpdir(), `gov-audit-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  const payload = JSON.stringify({ tool_name: 'Agent',
    tool_input: { subagent_type: 'ccip-security', override: 'I accept the risk' } });
  try {
    const res = cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8',
      env: { ...process.env, CCIP_GATE_ENFORCE: '1', CCIP_STATE_FILE: stateFile, CCIP_GOV_AUDIT_FILE: auditFile } });
    assert.strictEqual(res.status, 0);
    assert.strictEqual(JSON.parse(res.stdout).hookSpecificOutput.permissionDecision, 'deny');
    const lines = fs.readFileSync(auditFile, 'utf-8').trim().split('\n').filter(Boolean).map(JSON.parse);
    assert.strictEqual(lines[0].kind, 'override_rejected');
    assert.match(lines[0].remaining.join(' '), /security-reviewer/i);
  } finally {
    fs.rmSync(stateFile, { force: true });
    fs.rmSync(auditFile, { force: true });
  }
});

test('E-1 main: CCIP_OVERRIDE_DISABLED=1 → override ignored, deny stands', () => {
  const stateFile = writeTmpState({ session_id: 's', risk: 'LOW',
    agent_outputs: { 'a': {}, 'b': {}, 'c': {} }, dag: [] });
  const payload = JSON.stringify({ tool_name: 'Agent',
    tool_input: { subagent_type: 'ccip-dba', override: 'valid reason' } });
  try {
    const res = cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8',
      env: { ...process.env, CCIP_GATE_ENFORCE: '1', CCIP_OVERRIDE_DISABLED: '1', CCIP_STATE_FILE: stateFile } });
    assert.strictEqual(res.status, 0);
    assert.strictEqual(JSON.parse(res.stdout).hookSpecificOutput.permissionDecision, 'deny');
  } finally { fs.rmSync(stateFile, { force: true }); }
});
