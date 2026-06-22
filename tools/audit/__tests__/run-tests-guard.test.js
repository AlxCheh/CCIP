'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

// M-1 guard: the canonical runner MUST keep concurrency disabled. Several hook tests share
// singleton runtime fixtures; parallel execution makes them non-deterministic. If someone
// flips this to true (or removes it) without isolating those tests, this guard fails loudly
// instead of CI going silently flaky.
test('run-tests.js keeps concurrency:false (load-bearing for shared fixtures)', () => {
  const src = fs.readFileSync(path.join(gitRoot(), 'tools/audit/run-tests.js'), 'utf-8');
  assert.match(src, /concurrency:\s*false/,
    'run-tests.js must pass { concurrency: false } — see M-1 / cert 2026-06-10 §IX');
});
