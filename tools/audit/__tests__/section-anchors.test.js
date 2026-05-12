const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

test('section-anchors fails when §N not found', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/section-anchors.js');
  const fixture = path.join(root, 'tools/audit/__fixtures__/anchors-bad.md');
  const res = cp.spawnSync(process.execPath, [script, '--target', fixture]);
  assert.equal(res.status, 1);
  assert.match(res.stderr.toString(), /§5\.2/);
});

test('section-anchors passes when all anchors resolve', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/section-anchors.js');
  // Используем сам план как target — он не имеет §N ссылок без определений.
  const target = path.join(root, 'tools/audit/_lib/report.js');
  const res = cp.spawnSync(process.execPath, [script, '--target', target]);
  assert.equal(res.status, 0);
});
