const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

test('agent-frontmatter validates all agents', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/agent-frontmatter.js');
  const res = cp.spawnSync(process.execPath, [script]);
  assert.equal(res.status, 0, res.stderr.toString());
});
