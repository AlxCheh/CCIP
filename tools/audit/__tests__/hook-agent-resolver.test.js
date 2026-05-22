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

function freshState() {
  return {
    session_id: '2026-05-22-1200', task: 't', intents: [], risk: 'LOW',
    confidence: 'HIGH', routing: 'direct', dag: [], current_step: 0,
    agent_outputs: {}, status: 'executing', started_at: '', observations: []
  };
}

function feedHook(payload) {
  return cp.spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf-8' });
}

test('resolver ignores subagent_type for non-existent agent', () => {
  const restore = backupState();
  try {
    fs.writeFileSync(STATE, JSON.stringify(freshState()), 'utf-8');
    feedHook({
      tool_name: 'Agent',
      tool_input: { subagent_type: 'doc-optimizer' },
      tool_response: { content: 'noop' },
    });
    const after = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
    assert.deepEqual(after.agent_outputs, {}, 'phantom subagent_type must not produce agent_outputs entry');
  } finally { restore(); }
});

test('resolver accepts subagent_type for real agent', () => {
  const restore = backupState();
  try {
    fs.writeFileSync(STATE, JSON.stringify(freshState()), 'utf-8');
    feedHook({
      tool_name: 'Agent',
      tool_input: { subagent_type: 'ccip-architect' },
      tool_response: { content: 'ok' },
    });
    const after = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
    assert.ok(after.agent_outputs['ccip-architect'], 'real subagent_type must produce agent_outputs entry');
  } finally { restore(); }
});

test('resolver matches real agent name in description', () => {
  const restore = backupState();
  try {
    fs.writeFileSync(STATE, JSON.stringify(freshState()), 'utf-8');
    feedHook({
      tool_name: 'Agent',
      tool_input: { description: 'invoking ccip-backend-core for work', prompt: '' },
      tool_response: { content: 'ok' },
    });
    const after = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
    assert.ok(after.agent_outputs['ccip-backend-core'], 'real agent name in description must resolve');
  } finally { restore(); }
});

test('resolver ignores phantom agent name in description', () => {
  const restore = backupState();
  try {
    fs.writeFileSync(STATE, JSON.stringify(freshState()), 'utf-8');
    feedHook({
      tool_name: 'Agent',
      tool_input: { description: 'invoking doc-optimizer for work', prompt: '' },
      tool_response: { content: 'noop' },
    });
    const after = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
    assert.deepEqual(after.agent_outputs, {}, 'phantom agent name in description must not resolve');
  } finally { restore(); }
});
