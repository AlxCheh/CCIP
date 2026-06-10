const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const HOOK = path.join(root, '.claude/runtime/post-agent-hook.js');

// M-1: each test uses a UNIQUE tmp state file (CCIP_STATE_FILE) instead of the shared
// .claude/runtime/session-state.json — making this file parallel-safe (no cross-test races).
function mkState(obj) {
  const p = path.join(os.tmpdir(), `pah-state-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(p, JSON.stringify(obj), 'utf-8');
  return p;
}
function freshState(extra = {}) {
  return {
    session_id: '2026-01-01-1200', task: 't', intents: [], risk: 'LOW',
    confidence: 'HIGH', routing: 'direct', dag: [], current_step: 0,
    agent_outputs: {}, status: 'executing', started_at: '', observations: [],
    ...extra,
  };
}
function feed(payload, sf, extraEnv = {}) {
  return cp.spawnSync(process.execPath, [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf-8',
    env: { ...process.env, CCIP_STATE_FILE: sf, ...extraEnv },
  });
}

test('hook fails loud on malformed payload', () => {
  const sf = mkState(freshState());
  try {
    const res = feed('not-json', sf);
    const stderrOk = res.stderr && res.stderr.length > 0;
    const exitOk = res.status !== 0;
    assert.ok(stderrOk || exitOk, 'hook must surface errors (stderr or non-zero exit)');
  } finally { fs.rmSync(sf, { force: true }); }
});

test('hook skips when session_id empty', () => {
  const sf = mkState(freshState({ session_id: '', status: 'init' }));
  try {
    feed({ tool_name: 'Agent', tool_input: { subagent_type: 'ccip-architect' },
      tool_response: { content: 'hello' } }, sf);
    const after = JSON.parse(fs.readFileSync(sf, 'utf-8'));
    assert.deepEqual(after.agent_outputs, {}, 'agent_outputs must remain empty when session_id is empty');
  } finally { fs.rmSync(sf, { force: true }); }
});

test('hook performs atomic write (no .tmp left on success)', () => {
  const sf = mkState(freshState({ session_id: '2026-05-12-1200' }));
  try {
    feed({ tool_name: 'Agent', tool_input: { subagent_type: 'ccip-architect', description: 'x' },
      tool_response: { content: 'ok' } }, sf);
    // The hook writes `<sf>.tmp.<pid>`; assert none of ITS tmp artifacts remain.
    const dir = path.dirname(sf);
    const base = path.basename(sf);
    const leftovers = fs.readdirSync(dir).filter(f => f.startsWith(base) && f.includes('.tmp'));
    assert.deepEqual(leftovers, [], 'no .tmp file should remain after a successful atomic write');
  } finally { fs.rmSync(sf, { force: true }); }
});

test('dag_step in observation matches step.step number, not array index', () => {
  const sf = mkState(freshState({
    routing: 'planner',
    dag: [
      { step: 1, agent: 'ccip-architect', status: 'running', depends_on: [] },
      { step: 2, agent: 'ccip-backend-core', status: 'pending', depends_on: [1] },
    ],
  }));
  try {
    feed({ tool_name: 'Agent', tool_input: { subagent_type: 'ccip-architect' },
      tool_response: { content: '## State Update\n```json\n{"summary":"done","artifacts":[],"handoff_notes":""}\n```' } }, sf);
    const after = JSON.parse(fs.readFileSync(sf, 'utf-8'));
    assert.strictEqual(after.observations.length, 1);
    assert.strictEqual(after.observations[0].dag_step, 1,
      'dag_step must equal step.step (1-based) not current_step (0-based)');
  } finally { fs.rmSync(sf, { force: true }); }
});

test('dag_step is resolved by agent name, not current_step index (F-RT-09)', () => {
  const sf = mkState(freshState({
    routing: 'planner',
    dag: [
      { step: 1, agent: 'ccip-architect',    status: 'pending', depends_on: [] },
      { step: 2, agent: 'ccip-backend-core', status: 'pending', depends_on: [] },
    ],
  }));
  try {
    feed({ tool_name: 'Agent', tool_input: { subagent_type: 'ccip-backend-core' },
      tool_response: { content: '## State Update\n```json\n{"summary":"x","artifacts":[],"handoff_notes":""}\n```' } }, sf);
    const after = JSON.parse(fs.readFileSync(sf, 'utf-8'));
    assert.strictEqual(after.observations[0].dag_step, 2,
      'dag_step must equal the step.step of the agent that ran (2), not dag[current_step].step (1)');
    assert.strictEqual(after.dag.find(s => s.step === 2).status, 'done', 'the agent\'s own step must be marked done');
    assert.strictEqual(after.dag.find(s => s.step === 1).status, 'pending', 'a different step must NOT be marked done');
  } finally { fs.rmSync(sf, { force: true }); }
});

test('resolveAgent returns null when prompt mentions multiple agent names (F-RT-10)', () => {
  const sf = mkState(freshState());
  try {
    feed({ tool_name: 'Agent',
      tool_input: { prompt: 'coordinate ccip-architect and ccip-backend-core for this' },
      tool_response: { content: 'done' } }, sf);
    const after = JSON.parse(fs.readFileSync(sf, 'utf-8'));
    assert.strictEqual(after.observations.length, 0,
      'ambiguous agent mention must produce no observation (null resolve)');
    assert.deepEqual(after.agent_outputs, {}, 'ambiguous agent mention must not write agent_outputs');
  } finally { fs.rmSync(sf, { force: true }); }
});

test('observation flags missing_state_update when no block (ADR-017)', () => {
  const sf = mkState(freshState());
  try {
    const res = feed({ tool_name: 'Agent', tool_input: { subagent_type: 'ccip-architect' },
      tool_response: { content: 'did the work but forgot the block' } }, sf);
    const after = JSON.parse(fs.readFileSync(sf, 'utf-8'));
    assert.strictEqual(after.observations[0].missing_state_update, true);
    assert.ok(res.stderr.includes('no valid ## State Update'), 'must warn on stderr');
  } finally { fs.rmSync(sf, { force: true }); }
});

test('observation missing_state_update false when valid block present (ADR-017)', () => {
  const sf = mkState(freshState());
  try {
    feed({ tool_name: 'Agent', tool_input: { subagent_type: 'ccip-architect' },
      tool_response: { content: '## State Update\n```json\n{"summary":"s","artifacts":[],"handoff_notes":""}\n```' } }, sf);
    const after = JSON.parse(fs.readFileSync(sf, 'utf-8'));
    assert.strictEqual(after.observations[0].missing_state_update, false);
  } finally { fs.rmSync(sf, { force: true }); }
});

test('contract_debt accumulates and alerts at threshold (RFC R3)', () => {
  const sf = mkState(freshState());
  try {
    const payload = { tool_name: 'Agent', tool_input: { subagent_type: 'ccip-architect' },
      tool_response: { content: 'no block here' } };
    feed(payload, sf, { CCIP_CONTRACT_DEBT_THRESHOLD: '2' });
    let after = JSON.parse(fs.readFileSync(sf, 'utf-8'));
    assert.strictEqual(after.contract_debt, 1);
    assert.ok(!after.governance_alerts || after.governance_alerts.length === 0);
    feed(payload, sf, { CCIP_CONTRACT_DEBT_THRESHOLD: '2' });
    after = JSON.parse(fs.readFileSync(sf, 'utf-8'));
    assert.strictEqual(after.contract_debt, 2);
    assert.strictEqual(after.governance_alerts.length, 1);
    assert.strictEqual(after.governance_alerts[0].kind, 'state_contract_degraded');
  } finally { fs.rmSync(sf, { force: true }); }
});

test('valid block does not increment contract_debt (RFC R3)', () => {
  const sf = mkState(freshState());
  try {
    feed({ tool_name: 'Agent', tool_input: { subagent_type: 'ccip-architect' },
      tool_response: { content: '## State Update\n```json\n{"summary":"s","artifacts":[],"handoff_notes":""}\n```' } }, sf);
    const after = JSON.parse(fs.readFileSync(sf, 'utf-8'));
    assert.ok(!after.contract_debt, 'debt stays falsy on a compliant call');
  } finally { fs.rmSync(sf, { force: true }); }
});

test('E-2 reconciliation: completing agent removes its inflight_spawns entry', () => {
  const sf = mkState(freshState({
    session_id: '2026-05-12-1200',
    inflight_spawns: [
      { agent: 'ccip-architect', at: new Date().toISOString() },
      { agent: 'ccip-dba', at: new Date().toISOString() },
    ],
  }));
  try {
    feed({ tool_name: 'Agent', tool_input: { subagent_type: 'ccip-architect', description: 'x' },
      tool_response: { content: '## State Update\n```json\n{"summary":"done","artifacts":[],"handoff_notes":""}\n```' } }, sf);
    const after = JSON.parse(fs.readFileSync(sf, 'utf-8'));
    const names = (after.inflight_spawns || []).map(s => s.agent);
    assert.ok(!names.includes('ccip-architect'), 'completed agent removed from inflight');
    assert.ok(names.includes('ccip-dba'), 'other in-flight agent remains');
  } finally { fs.rmSync(sf, { force: true }); }
});
