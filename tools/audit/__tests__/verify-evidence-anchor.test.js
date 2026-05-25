const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { setupTmp, teardown, runHook, latestSession } = require('../_lib/run-evidence-hook');

function fixture(name) { return fs.readFileSync(path.join(__dirname, '..', '__fixtures__', name), 'utf-8'); }

test('C-2: quote inside the anchor window verifies', () => {
  const tmp = setupTmp();
  try {
    runHook(fixture('optimizer-output-c2-anchor-ok.md'), tmp);
    assert.match(latestSession(tmp), /evidence_rows_verified: 1\/1/);
  } finally { teardown(tmp); }
});

test('C-2: quote present in file but outside the anchor window is rejected', () => {
  const tmp = setupTmp();
  try {
    runHook(fixture('optimizer-output-c2-anchor-bad.md'), tmp);
    assert.match(latestSession(tmp), /L2_EVIDENCE_ROW_1: quote_not_in_anchor_window/);
  } finally { teardown(tmp); }
});
