const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, setupTmp, teardown, runHook, latestSession } = require('../_lib/run-evidence-hook');

function fixture(name) { return fs.readFileSync(path.join(__dirname, '..', '__fixtures__', name), 'utf-8'); }

test('C-3: git source path is passed literally, no shell execution', () => {
  const tmp = setupTmp();
  const sentinel = path.join(ROOT, 'pwned-sentinel.txt');
  try { fs.rmSync(sentinel, { force: true }); } catch {}
  try {
    runHook(fixture('optimizer-output-c3-inject.md'), tmp);
    const session = latestSession(tmp);
    assert.ok(!fs.existsSync(sentinel), 'shell metacharacters must NOT spawn a subshell');
    // The path contains spaces → caught by git_path_invalid guard; OR execFileSync
    // treats it literally → git_show_fail. Either is a secure rejection.
    assert.match(session, /L2_EVIDENCE_ROW_1: git_(?:show_fail|path_invalid)/, 'metachar path must be rejected securely (no shell exec)');
  } finally {
    try { fs.rmSync(sentinel, { force: true }); } catch {}
    teardown(tmp);
  }
});
