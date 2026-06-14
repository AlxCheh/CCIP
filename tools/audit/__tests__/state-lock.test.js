const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const { withStateLock } = require(path.join(gitRoot(), '.claude/runtime/state-lock.js'));
const tmpState = (s) => path.join(os.tmpdir(), `ccip-state-lock-test-${process.pid}-${s}`);

test('runs fn and releases lock (no .lock residue)', () => {
  const f = tmpState('free');
  const lock = f + '.lock';
  try { fs.unlinkSync(lock); } catch {}
  const r = withStateLock(f, () => 42);
  assert.strictEqual(r, 42);
  assert.ok(!fs.existsSync(lock), 'lock removed after fn');
});

test('reclaims a stale lock from a dead pid', () => {
  const f = tmpState('stale');
  const lock = f + '.lock';
  const dead = cp.spawnSync(process.execPath, ['-e', '0']); // already exited
  fs.writeFileSync(lock, JSON.stringify({ pid: dead.pid, at: Date.now() }));
  const r = withStateLock(f, () => 'ok');
  assert.strictEqual(r, 'ok');
  assert.ok(!fs.existsSync(lock));
});

test('reclaims a lock older than TTL even if pid alive', () => {
  const f = tmpState('ttl');
  const lock = f + '.lock';
  const old = Date.now() - 10 * 60 * 1000; // 10 min ago, well past default TTL
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, at: old }));
  const r = withStateLock(f, () => 'reclaimed');
  assert.strictEqual(r, 'reclaimed');
  try { fs.unlinkSync(lock); } catch {}
});

test('releases lock even if fn throws', () => {
  const f = tmpState('throw');
  const lock = f + '.lock';
  try { fs.unlinkSync(lock); } catch {}
  assert.throws(() => withStateLock(f, () => { throw new Error('boom'); }), /boom/);
  assert.ok(!fs.existsSync(lock), 'lock released on throw');
});

// ── #4 fail-closed tests (spawn child to control CCIP_STATE_LOCK_TIMEOUT_MS=1) ──

/**
 * Inline eval script: write lock held by current PID (live → not stale),
 * then call withStateLock immediately (ACQUIRE_TIMEOUT=1ms → instant timeout),
 * print JSON outcome.
 */
function mkTimeoutChild(stateFile, extraEnv = {}) {
  const HOOK = path.join(gitRoot(), '.claude/runtime/state-lock.js');
  const lockFile = stateFile + '.lock';
  const script = [
    `'use strict';`,
    `const fs = require('fs');`,
    `const { withStateLock } = require(${JSON.stringify(HOOK)});`,
    `const lockFile = ${JSON.stringify(lockFile)};`,
    `fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, at: Date.now() }));`,
    `let fnCalled = false; let failClosedCalled = false; let failOpenCalled = false;`,
    `const result = withStateLock(${JSON.stringify(stateFile)}, () => { fnCalled = true; return 'called'; }, {`,
    `  onFailClosed: (r) => { failClosedCalled = true; },`,
    `  onFailOpen:   (r) => { failOpenCalled   = true; },`,
    `  ...JSON.parse(process.env.EXTRA_OPTS || '{}'),`,
    `});`,
    `process.stdout.write(JSON.stringify({ result, fnCalled, failClosedCalled, failOpenCalled }) + '\\n');`,
    `try { fs.unlinkSync(lockFile); } catch {}`,
  ].join('\n');
  return cp.spawnSync(process.execPath, ['--eval', script], {
    encoding: 'utf-8',
    env: { ...process.env, CCIP_STATE_LOCK_TIMEOUT_MS: '1', ...extraEnv },
  });
}

test('#4 fail-closed env: skips fn, returns null, calls onFailClosed', () => {
  const f = tmpState('fc-env');
  try {
    const res = mkTimeoutChild(f, { CCIP_STATE_LOCK_FAILCLOSED: '1' });
    assert.strictEqual(res.status, 0, `child stderr: ${res.stderr}`);
    const out = JSON.parse(res.stdout.trim());
    assert.strictEqual(out.fnCalled, false, 'fn must NOT be called under fail-closed');
    assert.strictEqual(out.result, null, 'must return null under fail-closed');
    assert.strictEqual(out.failClosedCalled, true, 'onFailClosed must fire');
    assert.strictEqual(out.failOpenCalled, false, 'onFailOpen must NOT fire under fail-closed');
  } finally { try { fs.unlinkSync(f + '.lock'); } catch {} }
});

test('#4 fail-open (default): runs fn on timeout, calls onFailOpen', () => {
  const f = tmpState('fo-default');
  try {
    const res = mkTimeoutChild(f); // no CCIP_STATE_LOCK_FAILCLOSED
    assert.strictEqual(res.status, 0, `child stderr: ${res.stderr}`);
    const out = JSON.parse(res.stdout.trim());
    assert.strictEqual(out.fnCalled, true, 'fn MUST be called under default fail-open');
    assert.strictEqual(out.result, 'called');
    assert.strictEqual(out.failOpenCalled, true, 'onFailOpen must fire under fail-open');
    assert.strictEqual(out.failClosedCalled, false, 'onFailClosed must NOT fire under fail-open');
  } finally { try { fs.unlinkSync(f + '.lock'); } catch {} }
});

test('#4 opts.failClosed=true overrides global env (no CCIP_STATE_LOCK_FAILCLOSED)', () => {
  const f = tmpState('fc-opts');
  try {
    const res = mkTimeoutChild(f, { EXTRA_OPTS: JSON.stringify({ failClosed: true }) });
    assert.strictEqual(res.status, 0, `child stderr: ${res.stderr}`);
    const out = JSON.parse(res.stdout.trim());
    assert.strictEqual(out.fnCalled, false, 'fn must NOT be called with opts.failClosed=true');
    assert.strictEqual(out.result, null);
    assert.strictEqual(out.failClosedCalled, true);
  } finally { try { fs.unlinkSync(f + '.lock'); } catch {} }
});
