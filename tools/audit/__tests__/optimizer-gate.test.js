const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const GATE = path.join(gitRoot(), '.claude/runtime/optimizer-gate.js');

function runGate(lockFile, turnId) {
  const payload = { tool_name: 'Agent', tool_input: { subagent_type: 'ccip-session-optimizer' }, turn_id: turnId };
  return cp.spawnSync(process.execPath, [GATE], {
    input: JSON.stringify(payload), encoding: 'utf8',
    env: { ...process.env, OPT_LOCK_FILE: lockFile },
  });
}

test('C-4: first invocation allowed + writes lock; second (live lock, diff turn) denied', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-gate-'));
  const lock = path.join(tmp, 'optimizer.lock');
  try {
    const r1 = runGate(lock, 'turn-1');
    assert.ok(fs.existsSync(lock), 'gate must write the lock on first pass');
    assert.doesNotMatch(r1.stdout || '', /"permissionDecision":"deny"/);

    const r2 = runGate(lock, 'turn-2');
    assert.match(r2.stdout || '', /"permissionDecision":"deny"/, 'second invocation within TTL must be denied');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('C-4: non-optimizer Agent calls pass through untouched', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-gate-'));
  const lock = path.join(tmp, 'optimizer.lock');
  try {
    const payload = { tool_name: 'Agent', tool_input: { subagent_type: 'ccip-architect' }, turn_id: 'x' };
    const r = cp.spawnSync(process.execPath, [GATE], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, OPT_LOCK_FILE: lock } });
    assert.ok(!fs.existsSync(lock), 'gate must not lock for non-optimizer agents');
    assert.doesNotMatch(r.stdout || '', /deny/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
