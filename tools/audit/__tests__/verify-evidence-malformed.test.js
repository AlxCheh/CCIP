const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { setupTmp, teardown, runHook, latestSession } = require('../_lib/run-evidence-hook');

function fixture(name) { return fs.readFileSync(path.join(__dirname, '..', '__fixtures__', name), 'utf-8'); }

test('M-9: malformed (<5 col) evidence rows are surfaced explicitly', () => {
  const tmp = setupTmp();
  try {
    runHook(fixture('optimizer-output-m9-malformed.md'), tmp);
    assert.match(latestSession(tmp), /L3_MALFORMED_EVIDENCE_ROWS: 1/);
  } finally { teardown(tmp); }
});
