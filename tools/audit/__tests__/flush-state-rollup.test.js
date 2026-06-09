'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const HOOK = path.join(root, '.claude/runtime/flush-state.js');

function baseState(observations) {
  return {
    session_id: '2026-01-01-1200', task: 'rollup-test', intents: [], risk: 'LOW',
    confidence: 'HIGH', routing: 'planner', dag: [], current_step: 0,
    agent_outputs: {}, status: 'done', started_at: '', observations,
  };
}

function obs(agent, missing) {
  return { agent, session: '2026-01-01-1200', written_at: '2026-01-01T12:00:00.000Z',
    dag_step: 1, outcome: 'success', context_tokens: 100, reason: '',
    missing_state_update: missing };
}

function runHook(stateObj, extraEnv = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-rollup-'));
  const stateFile = path.join(tmpDir, 'session-state.json');
  const feedback = path.join(tmpDir, 'feedback-loop.md');
  fs.writeFileSync(stateFile, JSON.stringify(stateObj), 'utf-8');
  const env = { ...process.env, CCIP_STATE_FILE: stateFile, CCIP_FEEDBACK_FILE: feedback, ...extraEnv };
  cp.spawnSync(process.execPath, [HOOK], { encoding: 'utf-8', env });
  return { stateFile, feedback, tmpDir };
}

test('flush writes a rollup line naming agents that missed the block', () => {
  const { feedback, stateFile, tmpDir } = runHook(baseState([
    obs('ccip-architect', true), obs('ccip-backend-core', false), obs('ccip-dba', true),
  ]));
  try {
    const md = fs.readFileSync(feedback, 'utf-8');
    assert.ok(/2\/3 agents без ## State Update/.test(md), 'rollup count must be 2/3');
    assert.ok(md.includes('ccip-architect') && md.includes('ccip-dba'),
      'rollup must name the offending agents');
    assert.ok(!md.includes('ccip-backend-core,') && !/\(ccip-backend-core\)/.test(md),
      'compliant agent must not be listed as offender');
    assert.ok(/"missing_state_update":\s*true/.test(md),
      'per-observation JSON record must carry missing_state_update');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('flush writes no rollup line when all observations have the block', () => {
  const { feedback, tmpDir } = runHook(baseState([
    obs('ccip-architect', false), obs('ccip-dba', false),
  ]));
  try {
    const md = fs.readFileSync(feedback, 'utf-8');
    assert.ok(!/без ## State Update/.test(md), 'no rollup line for a fully-compliant session');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('flush saves contract_debt_agents for agents missing State Update block (D-05)', () => {
  const { stateFile, tmpDir } = runHook(baseState([
    obs('ccip-architect', true), obs('ccip-backend-core', false), obs('ccip-dba', true),
  ]));
  try {
    const after = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    assert.ok(Array.isArray(after.contract_debt_agents), 'contract_debt_agents must be an array');
    assert.ok(after.contract_debt_agents.includes('ccip-architect'), 'must include ccip-architect');
    assert.ok(after.contract_debt_agents.includes('ccip-dba'), 'must include ccip-dba');
    assert.ok(!after.contract_debt_agents.includes('ccip-backend-core'), 'must NOT include compliant agent');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('flush treats legacy observations without the field as compliant (ADR-017 backward-compat)', () => {
  const legacy = { agent: 'ccip-architect', session: '2026-01-01-1200',
    written_at: '2026-01-01T12:00:00.000Z', dag_step: 1, outcome: 'success',
    context_tokens: 100, reason: '' };
  const { feedback, tmpDir } = runHook(baseState([legacy]));
  try {
    const md = fs.readFileSync(feedback, 'utf-8');
    assert.ok(!/без ## State Update/.test(md),
      'absent field (undefined) must not count as a contract miss');
    assert.ok(/"missing_state_update":\s*false/.test(md),
      'legacy record must be serialized with the default false');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
