const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

test('path-canonical fails on bad fixture', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/path-canonical.js');
  const fixture = path.join(root, 'tools/audit/__fixtures__/path-bad.md');
  const res = cp.spawnSync(process.execPath, [script, '--target', fixture]);
  assert.equal(res.status, 1, 'expected exit 1');
  assert.match(res.stderr.toString(), /W:\/Claude\/CCIP/);
  assert.match(res.stderr.toString(), /CCIP\/docs/);
});

test('path-canonical passes on clean fixture', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/path-canonical.js');
  // CLAUDE.md уже должен быть canonical (но имеет ссылку — не префикс):
  const target = path.join(root, 'tools/audit/_lib/git-root.js');
  const res = cp.spawnSync(process.execPath, [script, '--target', target]);
  assert.equal(res.status, 0, res.stderr.toString());
});
