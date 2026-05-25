const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { setupTmp, teardown, runHook, latestSession } = require('../_lib/run-evidence-hook');

function fixture(name) { return fs.readFileSync(path.join(__dirname, '..', '__fixtures__', name), 'utf-8'); }

test('M-5: short low-signal quote is rejected', () => {
  const tmp = setupTmp();
  try {
    runHook(fixture('optimizer-output-m5-lowsignal.md'), tmp);
    const session = latestSession(tmp);
    assert.match(session, /L2_EVIDENCE_ROW_1: (quote_too_short|quote_low_signal)/);
  } finally { teardown(tmp); }
});
