'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();
const {
  detectSSC, detectTelemetryBlackout, detectHandoffDecay,
  detectContractCollapse, detectFallbackDegradation, detectAgentFailures, runDetectors,
} = require(path.join(root, '.claude/runtime/failure-detectors.js'));

// ── pure functions ─────────────────────────────────────────────────────────────

test('detectSSC returns null when ssc >= 0.8', () => {
  const obs = [{ missing_state_update: false }, { missing_state_update: false }];
  assert.strictEqual(detectSSC(obs), null);
});

test('detectSSC fires when ssc < 0.8', () => {
  // 4 observations, 2 missing → ssc = 0.50
  const obs = [
    { missing_state_update: true }, { missing_state_update: true },
    { missing_state_update: false }, { missing_state_update: false },
  ];
  const alert = detectSSC(obs);
  assert.strictEqual(alert.kind, 'silent_state_degradation');
  assert.strictEqual(alert.ssc, 0.5);
});

test('detectSSC returns null for empty observations', () => {
  assert.strictEqual(detectSSC([]), null);
});

test('detectTelemetryBlackout fires when agents ran but no events', () => {
  const obs = [{ agent: 'ccip-architect' }];
  const alert = detectTelemetryBlackout(obs, []);
  assert.strictEqual(alert.kind, 'telemetry_blackout');
});

test('detectTelemetryBlackout returns null when events exist', () => {
  const obs = [{ agent: 'ccip-architect' }];
  assert.strictEqual(detectTelemetryBlackout(obs, [{ tool: 'Read' }]), null);
});

test('detectTelemetryBlackout returns null when no observations (idle session)', () => {
  assert.strictEqual(detectTelemetryBlackout([], []), null);
});

test('detectHandoffDecay fires when > 40% empty handoffs', () => {
  const outputs = {
    'a': { handoff_notes: '' },
    'b': { handoff_notes: '' },
    'c': { handoff_notes: 'something useful' },
  };
  const alert = detectHandoffDecay(outputs);
  assert.strictEqual(alert.kind, 'handoff_decay');
  assert.ok(alert.ratio > 0.4);
});

test('detectHandoffDecay returns null when decay below threshold', () => {
  const outputs = { 'a': { handoff_notes: 'notes' }, 'b': { handoff_notes: 'notes' } };
  assert.strictEqual(detectHandoffDecay(outputs), null);
});

test('detectContractCollapse fires when debt >= threshold', () => {
  const state = { contract_debt: 3 };
  const alert = detectContractCollapse(state, 3);
  assert.strictEqual(alert.kind, 'contract_collapse');
  assert.strictEqual(alert.debt, 3);
});

test('detectContractCollapse returns null below threshold', () => {
  assert.strictEqual(detectContractCollapse({ contract_debt: 2 }, 3), null);
});

test('detectFallbackDegradation fires when general-purpose step lacks fallback_for', () => {
  const state = { dag: [{ step: 1, agent: 'general-purpose', status: 'done' }] };
  const alert = detectFallbackDegradation(state);
  assert.strictEqual(alert.kind, 'fallback_degradation');
  assert.deepEqual(alert.steps, [1]);
});

test('detectFallbackDegradation returns null when fallback_for present', () => {
  const state = { dag: [{ step: 1, agent: 'general-purpose', fallback_for: 'ccip-backend-core', status: 'done' }] };
  assert.strictEqual(detectFallbackDegradation(state), null);
});

// ── #6 Wave2: detectAgentFailures ────────────────────────────────────────────

test('#6 detectAgentFailures fires when count >= threshold', () => {
  const state = { agent_failure_counts: { 'ccip-architect': 2, 'ccip-dba': 0 } };
  const alert = detectAgentFailures(state, 2);
  assert.ok(alert, 'must return alert');
  assert.strictEqual(alert.kind, 'agent_failure_degraded');
  assert.ok(Array.isArray(alert.degraded) && alert.degraded.includes('ccip-architect'));
  assert.ok(!alert.degraded.includes('ccip-dba'), 'ccip-dba count=0, must not be in degraded list');
});

test('#6 detectAgentFailures returns null when no agent meets threshold', () => {
  const state = { agent_failure_counts: { 'ccip-architect': 1 } };
  assert.strictEqual(detectAgentFailures(state, 2), null);
});

test('#6 detectAgentFailures returns null when agent_failure_counts absent', () => {
  assert.strictEqual(detectAgentFailures({}, 2), null);
});

test('#6 runDetectors includes agent_failure_degraded when threshold met', () => {
  const state = {
    observations: [], agent_outputs: {}, contract_debt: 0, dag: [],
    agent_failure_counts: { 'ccip-architect': 3 },
  };
  const alerts = runDetectors(state, [], { agentFailThreshold: 2 });
  assert.ok(alerts.some(a => a.kind === 'agent_failure_degraded'), 'must include agent_failure_degraded');
});

test('runDetectors aggregates alerts into array', () => {
  // contract_debt=5 + blackout (no events but an observation)
  const state = {
    observations: [{ agent: 'a', missing_state_update: false }],
    agent_outputs: {}, contract_debt: 5, dag: [],
  };
  const alerts = runDetectors(state, [], { contractDebtThreshold: 3 });
  assert.ok(Array.isArray(alerts));
  const kinds = alerts.map(a => a.kind);
  assert.ok(kinds.includes('contract_collapse'));
  assert.ok(kinds.includes('telemetry_blackout'));
});

// ── main() integration ────────────────────────────────────────────────────────

const HOOK = path.join(root, '.claude/runtime/failure-detectors.js');

function writeTmpState(obj) {
  const p = path.join(os.tmpdir(), `fd-state-${Date.now()}.json`);
  fs.writeFileSync(p, JSON.stringify(obj), 'utf-8');
  return p;
}

test('main: appends alerts to governance_alerts when detectors fire', () => {
  const stateFile = writeTmpState({
    session_id: 's', task: 't', intents: [], risk: 'LOW', confidence: 'HIGH',
    routing: 'direct', status: 'executing', started_at: '', observations: [],
    contract_debt: 5, agent_outputs: {}, dag: [],
  });
  try {
    const res = cp.spawnSync(process.execPath, [HOOK], {
      encoding: 'utf-8',
      env: { ...process.env, CCIP_STATE_FILE: stateFile, CCIP_CONTRACT_DEBT_THRESHOLD: '3' },
    });
    assert.strictEqual(res.status, 0, res.stderr);
    const after = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    assert.ok(Array.isArray(after.governance_alerts) && after.governance_alerts.length > 0);
    assert.ok(after.governance_alerts.some(a => a.kind === 'contract_collapse'));
  } finally { fs.rmSync(stateFile, { force: true }); }
});

test('main: fail-open when state file missing', () => {
  const res = cp.spawnSync(process.execPath, [HOOK], {
    encoding: 'utf-8',
    env: { ...process.env, CCIP_STATE_FILE: '/nonexistent/state.json' },
  });
  assert.strictEqual(res.status, 0);
});
