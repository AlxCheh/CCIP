'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const os = require('node:os');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const HOOK = path.join(root, '.claude/runtime/flush-state.js');
const STATE = path.join(root, '.claude/runtime/session-state.json');

function backupState() {
  const original = fs.readFileSync(STATE, 'utf-8');
  return () => fs.writeFileSync(STATE, original, 'utf-8');
}

test('flush-state exits 0 when feedback-loop.md missing', () => {
  const restore = backupState();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-flush-test-'));
  const fakeFeedback = path.join(tmpDir, 'feedback-loop.md');

  try {
    const stateWithObs = {
      session_id: '2026-01-01-1200', task: 'test', intents: [], risk: 'LOW',
      confidence: 'HIGH', routing: 'direct', dag: [], current_step: 0,
      agent_outputs: {}, status: 'done', started_at: '', observations: [
        { agent: 'ccip-architect', session: '2026-01-01-1200',
          written_at: new Date().toISOString(),
          dag_step: 1, outcome: 'success', context_tokens: 100, reason: '' }
      ]
    };
    fs.writeFileSync(STATE, JSON.stringify(stateWithObs), 'utf-8');

    const res = cp.spawnSync(process.execPath, [HOOK], {
      encoding: 'utf-8',
      env: { ...process.env, CCIP_FEEDBACK_FILE: fakeFeedback }
    });

    assert.strictEqual(res.status, 0, 'hook must exit 0 even if feedback-loop.md missing');
    assert.ok(fs.existsSync(fakeFeedback), 'feedback-loop.md must be auto-created');
  } finally {
    restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
