const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { setupTmp, teardown, runHook, latestSession } = require('../_lib/run-evidence-hook');

function fixture(name) { return fs.readFileSync(path.join(__dirname, '..', '__fixtures__', name), 'utf-8'); }

test('M-1: repo: source escaping ROOT is rejected with path_escape', () => {
  const tmp = setupTmp();
  try {
    runHook(fixture('optimizer-output-m1-traversal.md'), tmp);
    const session = latestSession(tmp);
    assert.match(session, /L2_EVIDENCE_ROW_1: path_escape/);
  } finally { teardown(tmp); }
});
