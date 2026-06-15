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

// AND→OR (Opt1): security surface requires security-reviewer at ANY risk level (closes A2);
// HIGH risk WITHOUT a security surface does NOT require it (A1-2 stays allow).
test('Opt1: security surface at MEDIUM risk → deny (A2-1 JWT@MEDIUM)', () => {
  const state = { risk: 'MEDIUM', intents: ['BACKEND'], observations: [], agent_outputs: {},
    dag: [{ agent: 'ccip-backend-aux', scope: 'rotate JWT signing keys' }] };
  const payload = { tool_name: 'Agent', tool_input: { subagent_type: 'ccip-backend-aux' } };
  const r = evaluateGate(state, payload, { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'deny');
  assert.match(r.reason, /security-reviewer/i);
});

test('Opt1: security surface at LOW risk → deny (A2-2 RLS@LOW)', () => {
  const state = { risk: 'LOW', intents: ['BACKEND'], observations: [], agent_outputs: {},
    dag: [{ agent: 'ccip-backend-aux', scope: 'adjust RLS policy for tenant_id' }] };
  const payload = { tool_name: 'Agent', tool_input: { subagent_type: 'ccip-backend-aux' } };
  const r = evaluateGate(state, payload, { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'deny');
  assert.match(r.reason, /security-reviewer/i);
});

test('Opt1: HIGH risk WITHOUT security surface → allow (A1-2 PeriodEngine, no reviewer forced)', () => {
  const state = { risk: 'HIGH', intents: ['BACKEND'], observations: [], agent_outputs: {},
    dag: [{ agent: 'ccip-backend-core', scope: 'refactor PeriodEngine state machine' }] };
  const payload = { tool_name: 'Agent', tool_input: { subagent_type: 'ccip-backend-core' } };
  const r = evaluateGate(state, payload, { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'allow');
});

test('Opt1: SECURITY intent at LOW risk → deny (intent itself is a surface)', () => {
  const state = { risk: 'LOW', intents: ['SECURITY'], observations: [], agent_outputs: {}, dag: [] };
  const payload = { tool_name: 'Agent', tool_input: { subagent_type: 'ccip-security' } };
  const r = evaluateGate(state, payload, { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'deny');
  assert.match(r.reason, /security-reviewer/i);
});

// E-3: SECURITY_RE must cover ALL declared triggers (CLAUDE.md:84 — JWT/RBAC/RLS/multi-tenancy/GpToken/AuditLog).
// Each scope below intentionally omits the words 'auth'/'rbac'/'security' to prove the gap is closed.
const e3 = (scope) => ({
  risk: 'HIGH', intents: ['BACKEND'], observations: [], agent_outputs: {},
  dag: [{ agent: 'ccip-backend-aux', scope }],
});
for (const [label, scope] of [
  ['JWT',          'rotate JWT signing keys and refresh token TTL'],
  ['GpToken',      'tighten GpToken scope restrictions in the flow'],
  ['multi-tenancy','add multi-tenancy middleware for tenant_id isolation'],
  ['multitenancy', 'refactor multitenancy extension'],
  ['AuditLog',     'make AuditLog writes append-only inside the transaction'],
  ['audit log',    'ensure audit log entries are immutable'],
]) {
  test(`E-3: HIGH-risk "${label}" scope without security-reviewer → deny`, () => {
    const payload = { tool_name: 'Agent', tool_input: { subagent_type: 'ccip-backend-aux' } };
    const r = evaluateGate(e3(scope), payload, { enforce: true, maxAgents: 3 });
    assert.strictEqual(r.decision, 'deny', `"${label}" must require security-reviewer`);
    assert.match(r.reason, /security-reviewer/i);
  });
}

test('E-3: declared trigger but co-agent present → allow (no false block)', () => {
  const state = { risk: 'HIGH', intents: ['BACKEND'], observations: [], agent_outputs: {},
    dag: [{ agent: 'ccip-backend-aux', scope: 'GpToken flow' }, { agent: 'security-reviewer' }] };
  const payload = { tool_name: 'Agent', tool_input: { subagent_type: 'ccip-backend-aux' } };
  const r = evaluateGate(state, payload, { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'allow');
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

// E-2: budget must count in-flight spawns (approved, not yet completed) so a parallel
// burst in one turn cannot evade the limit. inflight_spawns is TTL-filtered.
const nowISO = () => new Date().toISOString();
test('E-2: inflight_spawns count toward budget (3 inflight, 0 completed → deny)', () => {
  const state = { risk: 'LOW', agent_outputs: {}, dag: [],
    inflight_spawns: [{ agent: 'a', at: nowISO() }, { agent: 'b', at: nowISO() }, { agent: 'c', at: nowISO() }] };
  const r = evaluateGate(state, agentPayload(), { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'deny');
  assert.match(r.reason, /budget/i);
});

test('E-2: agent_outputs + inflight combine (2 done + 1 inflight → deny on 4th)', () => {
  const state = { risk: 'LOW', agent_outputs: { 'x': {}, 'y': {} }, dag: [],
    inflight_spawns: [{ agent: 'z', at: nowISO() }] };
  const r = evaluateGate(state, agentPayload(), { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'deny');
});

test('E-2: stale inflight beyond TTL is NOT counted (self-heal on crashed agent)', () => {
  const old = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
  const state = { risk: 'LOW', agent_outputs: {}, dag: [],
    inflight_spawns: [{ agent: 'a', at: old }, { agent: 'b', at: old }, { agent: 'c', at: old }] };
  const r = evaluateGate(state, agentPayload(), { enforce: true, maxAgents: 3, inflightTtlMs: 600000 });
  assert.strictEqual(r.decision, 'allow', 'stale inflight must age out of the count');
});

test('E-2: 2 fresh inflight → 3rd allowed (under budget)', () => {
  const state = { risk: 'LOW', agent_outputs: {}, dag: [],
    inflight_spawns: [{ agent: 'a', at: nowISO() }, { agent: 'b', at: nowISO() }] };
  const r = evaluateGate(state, agentPayload(), { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'allow');
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
      env: { ...process.env, CCIP_GATE_ENFORCE: '1', CCIP_STATE_FILE: stateFile, CCIP_MAX_AGENTS: '3' } });
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
      env: { ...process.env, CCIP_STATE_FILE: stateFile, CCIP_MAX_AGENTS: '3' } });
    assert.strictEqual(res.status, 0);
    assert.strictEqual(res.stdout.trim(), '', 'shadow must not emit a deny decision');
    assert.match(res.stderr, /would-deny/i);
  } finally { fs.rmSync(stateFile, { force: true }); }
});

test('main: fail-open on malformed payload (exit 0, empty stdout) — observable (E-6)', () => {
  const audit = path.join(os.tmpdir(), `pag-audit-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  const stateFile = writeTmpState({ session_id: '2026-01-01-1200', governance_alerts: [] });
  try {
    const res = cp.spawnSync(process.execPath, [HOOK], { input: 'not-json', encoding: 'utf-8',
      env: { ...process.env, CCIP_GOV_AUDIT_FILE: audit, CCIP_STATE_FILE: stateFile } });
    assert.strictEqual(res.status, 0);
    assert.strictEqual(res.stdout.trim(), '', 'fail-open: no deny');
    const lines = fs.readFileSync(audit, 'utf-8').trim().split('\n').filter(Boolean).map(JSON.parse);
    assert.strictEqual(lines[0].kind, 'gate_failed_open');
    assert.strictEqual(lines[0].gate, 'pre-agent-gate');
    assert.strictEqual(lines[0].phase, 'parse');
    const st = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    assert.ok(st.governance_alerts.some(a => a.kind === 'gate_failed_open'), 'state alert pushed for reactor');
  } finally {
    fs.rmSync(audit, { force: true });
    fs.rmSync(stateFile, { force: true });
  }
});

test('E-1 main: override applied writes a durable governance-audit.jsonl line', () => {
  const stateFile = writeTmpState({ session_id: 'sess-ov', risk: 'LOW',
    agent_outputs: { 'a': {}, 'b': {}, 'c': {} }, dag: [] });
  const auditFile = path.join(os.tmpdir(), `gov-audit-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  const payload = JSON.stringify({ tool_name: 'Agent',
    tool_input: { subagent_type: 'ccip-dba', override: 'pilot needs 4th agent' } });
  try {
    const res = cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8',
      env: { ...process.env, CCIP_GATE_ENFORCE: '1', CCIP_STATE_FILE: stateFile, CCIP_GOV_AUDIT_FILE: auditFile, CCIP_MAX_AGENTS: '3' } });
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
      env: { ...process.env, CCIP_GATE_ENFORCE: '1', CCIP_OVERRIDE_DISABLED: '1', CCIP_STATE_FILE: stateFile, CCIP_MAX_AGENTS: '3' } });
    assert.strictEqual(res.status, 0);
    assert.strictEqual(JSON.parse(res.stdout).hookSpecificOutput.permissionDecision, 'deny');
  } finally { fs.rmSync(stateFile, { force: true }); }
});

test('E-2 main: an allowed spawn records itself in inflight_spawns', () => {
  const stateFile = writeTmpState({ session_id: 's', risk: 'LOW', agent_outputs: {}, dag: [] });
  const payload = JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: 'ccip-dba' } });
  try {
    const res = cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8',
      env: { ...process.env, CCIP_GATE_ENFORCE: '1', CCIP_STATE_FILE: stateFile } });
    assert.strictEqual(res.status, 0);
    assert.strictEqual(res.stdout.trim(), '', 'first spawn allowed');
    const st = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    assert.ok(Array.isArray(st.inflight_spawns) && st.inflight_spawns.length === 1);
    assert.strictEqual(st.inflight_spawns[0].agent, 'ccip-dba');
    assert.ok(st.inflight_spawns[0].at, 'inflight entry has a timestamp');
  } finally { fs.rmSync(stateFile, { force: true }); }
});

test('E-2 main: a denied spawn does NOT record inflight', () => {
  const stateFile = writeTmpState({ session_id: 's', risk: 'LOW',
    agent_outputs: { 'a': {}, 'b': {}, 'c': {} }, dag: [] });
  const payload = JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: 'ccip-dba' } });
  try {
    const res = cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8',
      env: { ...process.env, CCIP_GATE_ENFORCE: '1', CCIP_STATE_FILE: stateFile, CCIP_MAX_AGENTS: '3' } });
    assert.strictEqual(JSON.parse(res.stdout).hookSpecificOutput.permissionDecision, 'deny');
    const st = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    assert.ok(!st.inflight_spawns || st.inflight_spawns.length === 0, 'denied spawn must not be tracked');
  } finally { fs.rmSync(stateFile, { force: true }); }
});

test('E-2 burst: 4 sequential pre-gate calls — 4th denied (inflight accumulates)', () => {
  const stateFile = writeTmpState({ session_id: 's', risk: 'LOW', agent_outputs: {}, dag: [] });
  const spawn = (name) => cp.spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: name } }),
    encoding: 'utf-8', env: { ...process.env, CCIP_GATE_ENFORCE: '1', CCIP_STATE_FILE: stateFile, CCIP_MAX_AGENTS: '3' } });
  try {
    assert.strictEqual(spawn('ccip-dba').stdout.trim(), '', '1st allowed');
    assert.strictEqual(spawn('ccip-frontend').stdout.trim(), '', '2nd allowed');
    assert.strictEqual(spawn('ccip-devops').stdout.trim(), '', '3rd allowed');
    const r4 = spawn('ccip-qa');
    assert.strictEqual(JSON.parse(r4.stdout).hookSpecificOutput.permissionDecision, 'deny', '4th denied');
  } finally { fs.rmSync(stateFile, { force: true }); }
});

// ── #7 Wave3: expanded agent budget (default maxAgents=5) ────────────────────

test('#7 evaluateGate: 4th agent allowed by default budget (maxAgents=5)', () => {
  // 3 completed (composite DAG keys, as produced after Task 7.1)
  const state = {
    agent_outputs: {
      'ccip-architect:1': {}, 'ccip-dba:2': {}, 'ccip-backend-core:3': {},
    },
    dag: [], inflight_spawns: [],
  };
  const payload = { tool_name: 'Agent', tool_input: { subagent_type: 'ccip-frontend' } };
  const r = evaluateGate(state, payload, { enforce: true });
  assert.strictEqual(r.decision, 'allow',
    '4th agent must be allowed; default maxAgents was 3, now must be 5');
});

test('#7 evaluateGate: 6th agent DENIED by default budget (maxAgents=5)', () => {
  const state = {
    agent_outputs: {
      'ccip-architect:1': {}, 'ccip-dba:2': {}, 'ccip-backend-core:3': {},
      'ccip-frontend:4': {}, 'ccip-devops:5': {},
    },
    dag: [], inflight_spawns: [],
  };
  const payload = { tool_name: 'Agent', tool_input: { subagent_type: 'ccip-mobile' } };
  const r = evaluateGate(state, payload, { enforce: true });
  assert.strictEqual(r.decision, 'deny',
    '6th agent must be denied; 5 outputs consumed entire default budget');
  assert.match(r.reason, /budget/i);
});
