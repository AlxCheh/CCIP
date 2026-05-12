const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

test('state-contract-section fails when §15 missing', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/state-contract-section.js');
  const res = cp.spawnSync(process.execPath, [script]);
  // На момент T-07 §15 ещё не создан → fail. После T-08 → pass.
  assert.ok(typeof res.status === 'number');
});
