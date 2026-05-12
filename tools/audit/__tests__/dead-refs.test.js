const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

test('dead-refs fails on missing path', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/dead-refs.js');
  const fixture = path.join(root, 'tools/audit/__fixtures__/dead-refs-bad.md');
  const res = cp.spawnSync(process.execPath, [script, '--target', fixture]);
  assert.equal(res.status, 1);
  assert.match(res.stderr.toString(), /this-file-does-not-exist/);
});

test('dead-refs ignores code blocks', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/dead-refs.js');
  const fixture = path.join(root, 'tools/audit/__fixtures__/dead-refs-bad.md');
  const res = cp.spawnSync(process.execPath, [script, '--target', fixture]);
  assert.doesNotMatch(res.stderr.toString(), /fake-in-codeblock/);
});
