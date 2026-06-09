/**
 * UU-2: Integration tests for hook stdin handling on Windows.
 * Verifies hooks handle CRLF, UTF-8 non-ASCII, and empty stdin without crashing.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOOKS_DIR = path.resolve(__dirname, '../../../.claude/runtime');
const NODE = process.execPath;

function runHook(scriptName, stdinPayload, extraEnv) {
  const input = typeof stdinPayload === 'string' ? stdinPayload : JSON.stringify(stdinPayload);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-'));
  const tmpState = path.join(tmpDir, 'session-state.json');
  // initialise minimal state so hooks don't bail early
  fs.writeFileSync(tmpState, JSON.stringify({ session_id: 'test', observations: [], agent_outputs: {}, status: 'planning', dag: [] }));

  const result = spawnSync(NODE, [path.join(HOOKS_DIR, scriptName)], {
    input,
    encoding: 'utf8',
    timeout: 8000,
    env: { ...process.env, CCIP_STATE_FILE: tmpState, ...(extraEnv || {}) },
  });

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
    error: result.error,
    timedOut: result.status === null && !result.error,
  };
}

// ── post-agent-hook.js ────────────────────────────────────────────────────────

test('post-agent-hook: handles valid JSON stdin without crash', () => {
  const payload = {
    tool_name: 'Agent',
    tool_input: { description: 'test task', subagent_type: 'general-purpose' },
    tool_result: { content: [{ type: 'text', text: '## State Update\n```json\n{"summary":"ok","artifacts":[],"handoff_notes":""}\n```' }] },
  };
  const { error, timedOut, status } = runHook('post-agent-hook.js', payload);
  assert.ok(!error, `unexpected spawn error: ${error}`);
  assert.ok(!timedOut, 'hook timed out — likely hung on stdin');
  assert.ok([0, 1].includes(status), `expected 0 or 1, got ${status}`);
});

test('post-agent-hook: handles CRLF-terminated JSON without SyntaxError', () => {
  const payload = { tool_name: 'Read', tool_input: { file_path: '/tmp/x' }, tool_result: { content: 'ok' } };
  const crlfInput = JSON.stringify(payload) + '\r\n';
  const { error, stderr, timedOut } = runHook('post-agent-hook.js', crlfInput);
  assert.ok(!error);
  assert.ok(!timedOut, 'hook timed out on CRLF input');
  assert.ok(!stderr.includes('SyntaxError'), `SyntaxError in stderr: ${stderr}`);
});

test('post-agent-hook: handles empty stdin without hang', () => {
  const { error, timedOut } = runHook('post-agent-hook.js', '');
  assert.ok(!error);
  assert.ok(!timedOut, 'hook hung on empty stdin');
});

test('post-agent-hook: handles UTF-8 Cyrillic without crash', () => {
  const payload = {
    tool_name: 'Agent',
    tool_input: { description: 'тест кириллица', subagent_type: 'general-purpose' },
    tool_result: { content: [{ type: 'text', text: 'результат работы агента' }] },
  };
  const { error, stderr, timedOut } = runHook('post-agent-hook.js', payload);
  assert.ok(!error);
  assert.ok(!timedOut);
  assert.ok(!stderr.includes('SyntaxError'), `SyntaxError on Cyrillic: ${stderr}`);
});

// ── pre-agent-gate.js ─────────────────────────────────────────────────────────

test('pre-agent-gate: handles valid PreToolUse payload without crash', () => {
  const payload = {
    tool_name: 'Agent',
    tool_input: { description: 'test task', subagent_type: 'ccip-backend-core' },
  };
  const { error, stderr, timedOut } = runHook('pre-agent-gate.js', payload);
  assert.ok(!error);
  assert.ok(!timedOut, 'pre-agent-gate timed out');
  assert.ok(!stderr.includes('SyntaxError'), stderr);
});

test('pre-agent-gate: handles CRLF JSON without SyntaxError', () => {
  const crlfInput = JSON.stringify({ tool_name: 'Agent', tool_input: { description: 'x', subagent_type: 'general-purpose' } }) + '\r\n';
  const { error, stderr, timedOut } = runHook('pre-agent-gate.js', crlfInput);
  assert.ok(!error);
  assert.ok(!timedOut);
  assert.ok(!stderr.includes('SyntaxError'), stderr);
});

test('pre-agent-gate: handles empty stdin without hang', () => {
  const { error, timedOut } = runHook('pre-agent-gate.js', '');
  assert.ok(!error);
  assert.ok(!timedOut, 'pre-agent-gate hung on empty stdin');
});
