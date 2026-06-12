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
