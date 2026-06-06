'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const DAG = path.join(root, '.claude/runtime/execute-dag.js');
const STATE = path.join(root, '.claude/runtime/session-state.json');

function backupState() {
  const original = fs.readFileSync(STATE, 'utf-8');
  return () => fs.writeFileSync(STATE, original, 'utf-8');
}

test('--resume exits 1 when resume_count exceeds MAX_RESUMES', () => {
  const restore = backupState();
  try {
    const blockedState = {
      session_id: '2026-01-01-1200', task: 'test', intents: [], risk: 'LOW',
      confidence: 'HIGH', routing: 'planner', status: 'blocked',
      dag: [{ step: 1, agent: 'ccip-architect', status: 'failed', depends_on: [] }],
      current_step: 0, agent_outputs: {}, started_at: '', observations: [],
      resume_count: 5
    };
    fs.writeFileSync(STATE, JSON.stringify(blockedState), 'utf-8');

    const res = cp.spawnSync(process.execPath, [DAG, '--resume', '--dry-run'],
      { encoding: 'utf-8', cwd: root });

    assert.strictEqual(res.status, 1, 'must exit 1 when circuit breaker trips');
    assert.ok(res.stderr.includes('circuit breaker') || res.stdout.includes('circuit breaker'),
      'must mention circuit breaker in output');
  } finally {
    restore();
  }
});
