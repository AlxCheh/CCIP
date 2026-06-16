const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

// PFX_ABS is derived from gitRoot() so the fix rule matches on any machine (F-06).
// No concatenation trick needed — gitRoot() is evaluated at runtime, not a static string.
const PFX_CCIP = 'CCIP' + '/';
const rootFwd = gitRoot().replace(/\\/g, '/');
const PFX_ABS = rootFwd + '/';

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

test('path-canonical --fix rewrites deterministic prefixes to relative paths (#1)', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/path-canonical.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-pcfix-'));
  const file = path.join(tmp, 'doc.md');
  // Two fixable prefixes + one NON-deterministic absolute path that must be left alone.
  const before = [
    'see ' + PFX_CCIP + 'docs/architecture/x.md for details',
    'and ' + PFX_ABS + 'apps/web/y.ts too',
    'home dir ' + '/home/' + 'bob/secret stays (no deterministic target)',
  ].join('\n') + '\n';
  fs.writeFileSync(file, before, 'utf-8');
  try {
    const res = cp.spawnSync(process.execPath, [script, '--target', file, '--fix'], { encoding: 'utf-8' });
    const after = fs.readFileSync(file, 'utf-8');
    // CCIP/ prefix stripped → relative
    assert.match(after, /see docs\/architecture\/x\.md for details/);
    // absolute repo prefix stripped → relative (must NOT mangle into a half-path)
    assert.match(after, /and apps\/web\/y\.ts too/);
    assert.ok(!after.includes(rootFwd), 'absolute repo prefix fully removed');
    // non-deterministic absolute path is preserved AND still reported
    assert.match(after, /home dir \/home\/bob\/secret/);
    assert.equal(res.status, 1, 'unfixable violation remains → non-zero exit');
    assert.match(res.stderr, /home/, 'remaining violation still reported');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('path-canonical default (no --fix) never mutates the file (#1)', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/path-canonical.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-pcnofix-'));
  const file = path.join(tmp, 'doc.md');
  const before = 'see ' + PFX_CCIP + 'docs/x.md\n';
  fs.writeFileSync(file, before, 'utf-8');
  try {
    const res = cp.spawnSync(process.execPath, [script, '--target', file], { encoding: 'utf-8' });
    assert.equal(fs.readFileSync(file, 'utf-8'), before, 'detect-only mode leaves file untouched');
    assert.equal(res.status, 1, 'detect-only still flags the violation');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
