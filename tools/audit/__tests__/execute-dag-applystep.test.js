'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const { applyStepResult, selectEffectiveAgent } = require(path.join(root, '.claude/runtime/execute-dag.js'));

function freshState() {
  return {
    session_id: '2026-01-01-1200',
    dag: [{ step: 1, agent: 'ccip-architect', status: 'running' }],
    current_step: 0, agent_outputs: {}, observations: [],
  };
}

test('applyStepResult flags missing_state_update when output has no block', () => {
  const state = freshState();
  applyStepResult(state, { step: 1, agent: 'ccip-architect' }, 'did work, no block');
  assert.strictEqual(state.observations[0].missing_state_update, true);
  assert.strictEqual(state.observations[0].outcome, 'success',
    'outcome stays success — orthogonal to the contract flag');
});

test('applyStepResult: valid block → missing_state_update false', () => {
  const state = freshState();
  const out = '## State Update\n```json\n{"summary":"s","artifacts":[],"handoff_notes":""}\n```';
  applyStepResult(state, { step: 1, agent: 'ccip-architect' }, out);
  assert.strictEqual(state.observations[0].missing_state_update, false);
});

// ── #2 Wave2: INV-STATE-CONTRACT-DAG governance_alerts ────────────────────────

test('#2 non-exempt agent missing ## State Update → governance_alert pushed', () => {
  const state = freshState();
  applyStepResult(state, { step: 1, agent: 'ccip-architect' }, 'did work, no block');
  assert.ok(Array.isArray(state.governance_alerts), 'governance_alerts must be initialised');
  assert.strictEqual(state.governance_alerts.length, 1, 'exactly one alert pushed');
  assert.strictEqual(state.governance_alerts[0].kind, 'state_contract_degraded');
  assert.strictEqual(state.governance_alerts[0].agent, 'ccip-architect');
  assert.strictEqual(state.governance_alerts[0].source, 'execute-dag');
});

test('#2 exempt agent (ccip-session-optimizer) missing block → no governance_alert', () => {
  const state = freshState();
  applyStepResult(state, { step: 1, agent: 'ccip-session-optimizer' }, 'relay output, no block');
  assert.ok(!state.governance_alerts || state.governance_alerts.length === 0,
    'exempt agents must not push governance_alert');
});

test('#2 non-exempt agent WITH valid ## State Update → no governance_alert', () => {
  const state = freshState();
  const out = '## State Update\n```json\n{"summary":"s","artifacts":[],"handoff_notes":""}\n```';
  applyStepResult(state, { step: 1, agent: 'ccip-architect' }, out);
  assert.ok(!state.governance_alerts || state.governance_alerts.length === 0,
    'valid block must not produce alert');
});

// ── #6 Wave2: agent_failure_counts ────────────────────────────────────────────

test('#6 applyStepResult: non-exempt agent missing block → increments agent_failure_counts', () => {
  const state = freshState();
  applyStepResult(state, { step: 1, agent: 'ccip-architect' }, 'no block');
  assert.ok(state.agent_failure_counts && state.agent_failure_counts['ccip-architect'] === 1,
    'failure count must be 1 after first miss');
  applyStepResult(state, { step: 1, agent: 'ccip-architect' }, 'no block again');
  assert.strictEqual(state.agent_failure_counts['ccip-architect'], 2,
    'failure count must be 2 after second miss');
});

test('#6 applyStepResult: exempt agent missing block → does NOT increment count', () => {
  const state = freshState();
  applyStepResult(state, { step: 1, agent: 'ccip-session-optimizer' }, 'relay, no block');
  assert.ok(!state.agent_failure_counts || !state.agent_failure_counts['ccip-session-optimizer'],
    'exempt agent must not accumulate failure count');
});

// ── #6 Wave2: selectEffectiveAgent auto-switch ────────────────────────────────

test('#6 selectEffectiveAgent: no failures → returns step unchanged', () => {
  const state = { agent_failure_counts: { 'ccip-architect': 0 } };
  const step = { step: 1, agent: 'ccip-architect' };
  const eff = selectEffectiveAgent(state, step, { threshold: 2 });
  assert.strictEqual(eff.agent, 'ccip-architect');
  assert.ok(!eff.fallback_for, 'must not set fallback_for on non-degraded step');
});

test('#6 selectEffectiveAgent: failures >= threshold → substitutes backup agent', () => {
  const state = { agent_failure_counts: { 'ccip-architect': 2 } };
  const step = { step: 1, agent: 'ccip-architect' };
  const eff = selectEffectiveAgent(state, step, { threshold: 2 });
  assert.notStrictEqual(eff.agent, 'ccip-architect', 'must switch to backup');
  assert.strictEqual(eff.fallback_for, 'ccip-architect', 'must mark original as fallback_for');
});

test('#6 selectEffectiveAgent: no backup defined → returns step unchanged even if degraded', () => {
  const state = { agent_failure_counts: { 'general-purpose': 5 } };
  const step = { step: 1, agent: 'general-purpose' };
  const eff = selectEffectiveAgent(state, step, { threshold: 2 });
  assert.strictEqual(eff.agent, 'general-purpose', 'no backup for general-purpose → keep original');
});
