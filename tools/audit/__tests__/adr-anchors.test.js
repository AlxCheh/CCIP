const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

test('adr-anchors validates all ADR impl_anchors exist', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/adr-anchors.js');
  const res = cp.spawnSync(process.execPath, [script]);
  assert.equal(res.status, 0, res.stderr.toString());
});
