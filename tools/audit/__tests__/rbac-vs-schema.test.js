const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

test('rbac-vs-schema fails on phantom roles', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/rbac-vs-schema.js');
  const res = cp.spawnSync(process.execPath, [script]);
  assert.equal(res.status, 0, res.stderr.toString());
});
