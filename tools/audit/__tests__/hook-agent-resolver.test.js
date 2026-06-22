const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const HOOK = path.join(root, '.claude/runtime/post-agent-hook.js');

// M-1: isolate to a unique tmp state file per test (CCIP_STATE_FILE), so this file never
// touches the shared .claude/runtime/session-state.json — making it parallel-safe.
function tmpState() {
  const p = path.join(os.tmpdir(), `har-state-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(p, JSON.stringify({
    session_id: '2026-05-22-1200', task: 't', intents: [], risk: 'LOW',
    confidence: 'HIGH', routing: 'direct', dag: [], current_step: 0,
    agent_outputs: {}, status: 'executing', started_at: '', observations: [],
  }), 'utf-8');
  return p;
}

function feedHook(payload, stateFile) {
  return cp.spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf-8',
    env: { ...process.env, CCIP_STATE_FILE: stateFile },
  });
}

test('resolver ignores subagent_type for non-existent agent', () => {
  const sf = tmpState();
  try {
    feedHook({
      tool_name: 'Agent',
      tool_input: { subagent_type: 'doc-optimizer' },
      tool_response: { content: 'noop' },
    }, sf);
    const after = JSON.parse(fs.readFileSync(sf, 'utf-8'));
    assert.deepEqual(after.agent_outputs, {}, 'phantom subagent_type must not produce agent_outputs entry');
  } finally { fs.rmSync(sf, { force: true }); }
});

test('resolver accepts subagent_type for real agent', () => {
  const sf = tmpState();
  try {
    feedHook({
      tool_name: 'Agent',
      tool_input: { subagent_type: 'ccip-architect' },
      tool_response: { content: 'ok' },
    }, sf);
    const after = JSON.parse(fs.readFileSync(sf, 'utf-8'));
    assert.ok(after.agent_outputs['ccip-architect'], 'real subagent_type must produce agent_outputs entry');
  } finally { fs.rmSync(sf, { force: true }); }
});

test('resolver matches real agent name in description', () => {
  const sf = tmpState();
  try {
    feedHook({
      tool_name: 'Agent',
      tool_input: { description: 'invoking ccip-backend-core for work', prompt: '' },
      tool_response: { content: 'ok' },
    }, sf);
    const after = JSON.parse(fs.readFileSync(sf, 'utf-8'));
    assert.ok(after.agent_outputs['ccip-backend-core'], 'real agent name in description must resolve');
  } finally { fs.rmSync(sf, { force: true }); }
});

test('resolver ignores phantom agent name in description', () => {
  const sf = tmpState();
  try {
    feedHook({
      tool_name: 'Agent',
      tool_input: { description: 'invoking doc-optimizer for work', prompt: '' },
      tool_response: { content: 'noop' },
    }, sf);
    const after = JSON.parse(fs.readFileSync(sf, 'utf-8'));
    assert.deepEqual(after.agent_outputs, {}, 'phantom agent name in description must not resolve');
  } finally { fs.rmSync(sf, { force: true }); }
});
