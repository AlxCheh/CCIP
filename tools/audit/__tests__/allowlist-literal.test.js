const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const SCRIPT = path.join(root, 'tools/audit/allowlist-literal.js');

test('allowlist-literal fails on bad fixture (wildcard suffix)', () => {
  const fixture = path.join(root, 'tools/audit/__fixtures__/allowlist-bad.json');
  const res = cp.spawnSync(process.execPath, [SCRIPT, '--settings', fixture], { encoding: 'utf-8' });
  assert.equal(res.status, 1, `expected exit 1, got ${res.status}; stderr: ${res.stderr}`);
  assert.match(res.stderr, /git add \*/, 'must name the offending pattern');
  assert.match(res.stderr, /Bash\(\*\)/, 'must catch pure wildcard');
});

test('allowlist-literal passes on clean fixture', () => {
  const fixture = path.join(root, 'tools/audit/__fixtures__/allowlist-good.json');
  const res = cp.spawnSync(process.execPath, [SCRIPT, '--settings', fixture], { encoding: 'utf-8' });
  assert.equal(res.status, 0, res.stderr);
});

test('allowlist-literal passes on real .claude/settings.local.json', () => {
  const res = cp.spawnSync(process.execPath, [SCRIPT], { encoding: 'utf-8' });
  assert.equal(res.status, 0, res.stderr);
});
