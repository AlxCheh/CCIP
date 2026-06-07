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

function stateWithObs() {
  return {
    session_id: '2026-01-01-1200', task: 'idem-test', intents: [], risk: 'LOW',
    confidence: 'HIGH', routing: 'planner', dag: [], current_step: 0,
    agent_outputs: {}, status: 'done', started_at: '',
    observations: [
      { agent: 'ccip-architect', session: '2026-01-01-1200',
        written_at: '2026-01-01T12:00:00.000Z', dag_step: 1,
        outcome: 'success', context_tokens: 100, reason: '' },
    ],
  };
}

test('re-flushing identical observations does not duplicate the block', () => {
  const restore = backupState();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-idem-'));
  const fakeFeedback = path.join(tmpDir, 'feedback-loop.md');
  try {
    const env = { ...process.env, CCIP_FEEDBACK_FILE: fakeFeedback };

    // First flush
    fs.writeFileSync(STATE, JSON.stringify(stateWithObs()), 'utf-8');
    cp.spawnSync(process.execPath, [HOOK], { encoding: 'utf-8', env });

    // Simulate the crash window: observations were NOT cleared from state
    // (e.g. process died after appendFileSync). Re-run flush with same batch.
    fs.writeFileSync(STATE, JSON.stringify(stateWithObs()), 'utf-8');
    cp.spawnSync(process.execPath, [HOOK], { encoding: 'utf-8', env });

    const feedback = fs.readFileSync(fakeFeedback, 'utf-8');
    const occurrences = feedback.split('flush:2026-01-01-1200:').length - 1;
    assert.strictEqual(occurrences, 1,
      'identical observation batch must be appended at most once (idempotent)');
  } finally {
    restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
