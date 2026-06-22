'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();
const { buildPrompt } = require(path.join(root, '.claude/runtime/execute-dag.js'));

test('buildPrompt injects fallback context when step.fallback_for is set (RFC R8)', () => {
  const state = { task: 't', session_id: 's', intents: [], risk: 'LOW', confidence: 'HIGH', agent_outputs: {} };
  const step = { step: 1, agent: 'general-purpose', scope: 'do the thing', fallback_for: 'ccip-backend-core' };
  const prompt = buildPrompt(state, step);
  assert.match(prompt, /Domain Bootstrap \(fallback for ccip-backend-core\)/);
});

test('buildPrompt does not inject fallback context when fallback_for absent', () => {
  const state = { task: 't', session_id: 's', intents: [], risk: 'LOW', confidence: 'HIGH', agent_outputs: {} };
  const step = { step: 1, agent: 'ccip-backend-core', scope: 'do the thing' };
  const prompt = buildPrompt(state, step);
  assert.doesNotMatch(prompt, /Domain Bootstrap/);
});
