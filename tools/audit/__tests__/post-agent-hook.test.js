const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const HOOK = path.join(root, '.claude/runtime/post-agent-hook.js');
const STATE = path.join(root, '.claude/runtime/session-state.json');

function backupState() {
  const original = fs.readFileSync(STATE, 'utf-8');
  return () => fs.writeFileSync(STATE, original, 'utf-8');
}

test('hook fails loud on malformed payload', () => {
  const restore = backupState();
  try {
    const res = cp.spawnSync(process.execPath, [HOOK], { input: 'not-json', encoding: 'utf-8' });
    const stderrOk = res.stderr && res.stderr.length > 0;
    const exitOk = res.status !== 0;
    assert.ok(stderrOk || exitOk, 'hook must surface errors (stderr or non-zero exit)');
  } finally {
    restore();
  }
});

test('hook skips when session_id empty', () => {
  const restore = backupState();
  try {
    fs.writeFileSync(STATE, JSON.stringify({
      session_id: '', task: '', intents: [], risk: 'LOW', confidence: 'HIGH',
      routing: 'direct', dag: [], current_step: 0, agent_outputs: {}, status: 'init',
      started_at: '', observations: []
    }), 'utf-8');
    const payload = JSON.stringify({
      tool_name: 'Agent',
      tool_input: { subagent_type: 'ccip-architect' },
      tool_response: { content: 'hello' }
    });
    cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8' });
    const after = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
    assert.deepEqual(after.agent_outputs, {}, 'agent_outputs must remain empty when session_id is empty');
  } finally {
    restore();
  }
});

test('hook performs atomic write (no .tmp left on success)', () => {
  const restore = backupState();
  try {
    fs.writeFileSync(STATE, JSON.stringify({
      session_id: '2026-05-12-1200', task: 't', intents: [], risk: 'LOW',
      confidence: 'HIGH', routing: 'direct', dag: [], current_step: 0,
      agent_outputs: {}, status: 'executing', started_at: '', observations: []
    }), 'utf-8');
    const payload = JSON.stringify({
      tool_name: 'Agent',
      tool_input: { subagent_type: 'ccip-architect', description: 'x' },
      tool_response: { content: 'ok' }
    });
    cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8' });
    const dir = path.dirname(STATE);
    const tmps = fs.readdirSync(dir).filter(f => f.includes('.tmp'));
    assert.deepEqual(tmps, [], 'no .tmp file should remain after a successful atomic write');
  } finally {
    restore();
  }
});
