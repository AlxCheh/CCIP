'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { setupTmp, teardown, runHook } = require('../_lib/run-evidence-hook');

function fixture(name) { return fs.readFileSync(path.join(__dirname, '..', '__fixtures__', name), 'utf-8'); }

test('C-5: internal fault writes a VERIFIER_ERROR beacon to the index', () => {
  const tmp = setupTmp();
  try {
    const r = runHook(fixture('optimizer-output-clean.md'), tmp, { OPT_FORCE_FAULT: '1' });
    assert.strictEqual(r.status, 0, 'hook must still exit 0 on internal fault');
    const index = fs.readFileSync(tmp.index, 'utf-8');
    assert.match(index, /VERIFIER_ERROR/, 'beacon must be appended to the index file');
  } finally { teardown(tmp); }
});
