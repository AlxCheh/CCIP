'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const { applyStepResult } = require(path.join(root, '.claude/runtime/execute-dag.js'));

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
