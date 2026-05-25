const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { acquireSerialGuard } = require('../_lib/serial-guard');

// Свои temp-локи на каждый кейс → этот файл НЕ трогает DEFAULT_LOCK и безопасен
// при параллельном запуске (в отличие от token-rules-* тестов, что он и защищает).
const tmpLock = (suffix) => path.join(os.tmpdir(), `ccip-serial-guard-test-${process.pid}-${suffix}.lock`);

test('acquires when free and release removes the lock', () => {
  const lock = tmpLock('free');
  try { fs.unlinkSync(lock); } catch {}
  const release = acquireSerialGuard('t', lock);
  try {
    assert.ok(fs.existsSync(lock));
    assert.strictEqual(fs.readFileSync(lock, 'utf-8'), String(process.pid));
  } finally { release(); }
  assert.ok(!fs.existsSync(lock), 'release removed the lock');
});

test('throws a clear message when a live process holds the lock', () => {
  const lock = tmpLock('live');
  fs.writeFileSync(lock, String(process.pid)); // текущий процесс заведомо жив
  try {
    assert.throws(() => acquireSerialGuard('t-live', lock), /test:audit/);
    assert.ok(fs.existsSync(lock), 'чужой лок сохранён (мы им не владели)');
  } finally { try { fs.unlinkSync(lock); } catch {} }
});

test('reclaims a stale lock left by a dead process', () => {
  const lock = tmpLock('stale');
  const dead = cp.spawnSync(process.execPath, ['-e', '0']); // ребёнок уже завершился
  fs.writeFileSync(lock, String(dead.pid));
  const release = acquireSerialGuard('t-stale', lock);
  try {
    assert.strictEqual(fs.readFileSync(lock, 'utf-8'), String(process.pid), 'лок переиспользован');
  } finally { release(); }
  assert.ok(!fs.existsSync(lock));
});
