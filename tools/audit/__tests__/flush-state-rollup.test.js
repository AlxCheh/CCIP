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
const STATE = path.join(root, '.claude/runtime/session-state.json');

function backupState() {
  const original = fs.readFileSync(STATE, 'utf-8');
  return () => fs.writeFileSync(STATE, original, 'utf-8');
}

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

test('flush writes a rollup line naming agents that missed the block', () => {
  const restore = backupState();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-rollup-'));
  const feedback = path.join(tmpDir, 'feedback-loop.md');
  try {
    const env = { ...process.env, CCIP_FEEDBACK_FILE: feedback };
    fs.writeFileSync(STATE, JSON.stringify(baseState([
      obs('ccip-architect', true), obs('ccip-backend-core', false), obs('ccip-dba', true),
    ])), 'utf-8');
    cp.spawnSync(process.execPath, [HOOK], { encoding: 'utf-8', env });
    const md = fs.readFileSync(feedback, 'utf-8');
    assert.ok(/2\/3 agents без ## State Update/.test(md), 'rollup count must be 2/3');
    assert.ok(md.includes('ccip-architect') && md.includes('ccip-dba'),
      'rollup must name the offending agents');
    assert.ok(!md.includes('ccip-backend-core,') && !/\(ccip-backend-core\)/.test(md),
      'compliant agent must not be listed as offender');
    // F-01: the flag must survive into the per-observation JSON, not only the rollup line.
    assert.ok(/"missing_state_update":\s*true/.test(md),
      'per-observation JSON record must carry missing_state_update');
  } finally {
    restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('flush writes no rollup line when all observations have the block', () => {
  const restore = backupState();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-rollup2-'));
  const feedback = path.join(tmpDir, 'feedback-loop.md');
  try {
    const env = { ...process.env, CCIP_FEEDBACK_FILE: feedback };
    fs.writeFileSync(STATE, JSON.stringify(baseState([
      obs('ccip-architect', false), obs('ccip-dba', false),
    ])), 'utf-8');
    cp.spawnSync(process.execPath, [HOOK], { encoding: 'utf-8', env });
    const md = fs.readFileSync(feedback, 'utf-8');
    assert.ok(!/без ## State Update/.test(md), 'no rollup line for a fully-compliant session');
  } finally {
    restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('flush treats legacy observations without the field as compliant (ADR-017 backward-compat)', () => {
  const restore = backupState();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-rollup3-'));
  const feedback = path.join(tmpDir, 'feedback-loop.md');
  try {
    const env = { ...process.env, CCIP_FEEDBACK_FILE: feedback };
    // Legacy record — predates ADR-017, has NO missing_state_update key at all.
    const legacy = { agent: 'ccip-architect', session: '2026-01-01-1200',
      written_at: '2026-01-01T12:00:00.000Z', dag_step: 1, outcome: 'success',
      context_tokens: 100, reason: '' };
    fs.writeFileSync(STATE, JSON.stringify(baseState([legacy])), 'utf-8');
    cp.spawnSync(process.execPath, [HOOK], { encoding: 'utf-8', env });
    const md = fs.readFileSync(feedback, 'utf-8');
    assert.ok(!/без ## State Update/.test(md),
      'absent field (undefined) must not count as a contract miss');
    assert.ok(/"missing_state_update":\s*false/.test(md),
      'legacy record must be serialized with the default false');
  } finally {
    restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
