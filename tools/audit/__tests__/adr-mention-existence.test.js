const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const script = path.join(gitRoot(), 'tools/audit/adr-mention-existence.js');
const fixture = path.join(gitRoot(), 'tools/audit/__fixtures__/adr-mention-bad.md');

test('adr-mention-existence fails on phantom ADR slug in fixture', () => {
  const res = cp.spawnSync(process.execPath, [script, '--target', fixture]);
  assert.equal(res.status, 1);
  assert.match(res.stderr.toString(), /ADR-099-this-does-not-exist\.md/);
});

test('adr-mention-existence accepts real ADR slug in fixture', () => {
  const res = cp.spawnSync(process.execPath, [script, '--target', fixture]);
  assert.doesNotMatch(res.stderr.toString(), /ADR-001-backend-framework/);
});
