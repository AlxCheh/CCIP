'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();
const RGS = path.join(root, 'tools/audit/rgs.js');
const { computeEC } = require(RGS);

test('computeEC = enforced share of invariants', () => {
  const m = { invariants: [
    { kind: 'block' }, { kind: 'signal' }, { kind: 'advisory' }, { kind: 'signal' },
  ] };
  assert.strictEqual(computeEC(m), 0.75); // 3 of 4 are block|signal
});

test('rgs.js prints EC + TI + composite and exits 0 (advisory)', () => {
  const res = cp.spawnSync(process.execPath, [RGS], { encoding: 'utf-8', cwd: root });
  assert.strictEqual(res.status, 0);
  assert.match(res.stdout, /\[RGS\]/);
  assert.match(res.stdout, /EC=/);
  assert.match(res.stdout, /TI=/);
});
