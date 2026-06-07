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
  const r = evaluateGate({ risk: 'LOW', observations: [{ agent: 'a' }] }, agentPayload(), { maxAgents: 3 });
  assert.strictEqual(r.decision, 'allow');
});

test('budget reached + enforce → deny', () => {
  const state = { risk: 'LOW', observations: [{ agent: 'a' }, { agent: 'b' }, { agent: 'c' }] };
  const r = evaluateGate(state, agentPayload(), { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'deny');
  assert.match(r.reason, /budget/i);
});

test('budget reached + shadow (default) → allow but flags wouldDeny', () => {
  const state = { risk: 'LOW', observations: [{ agent: 'a' }, { agent: 'b' }, { agent: 'c' }] };
  const r = evaluateGate(state, agentPayload(), { enforce: false, maxAgents: 3 });
  assert.strictEqual(r.decision, 'allow');
  assert.strictEqual(r.wouldDeny, true);
});

test('budget reached + override → allow (audited)', () => {
  const state = { risk: 'LOW', observations: [{ agent: 'a' }, { agent: 'b' }, { agent: 'c' }] };
  const r = evaluateGate(state, agentPayload({ override: true }), { enforce: true, maxAgents: 3 });
  assert.strictEqual(r.decision, 'allow');
  assert.strictEqual(r.overridden, true);
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

test('non-Agent payload → allow (gate is Agent-only)', () => {
  const r = evaluateGate({ risk: 'HIGH' }, { tool_name: 'Bash', tool_input: {} }, { enforce: true });
  assert.strictEqual(r.decision, 'allow');
});
