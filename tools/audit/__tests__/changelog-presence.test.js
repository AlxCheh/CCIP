const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const SCRIPT = path.join(gitRoot(), 'tools/audit/changelog-presence.js');

function makeTmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-'));
  const run = (args) => cp.execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  run(['init', '-q', '-b', 'main']);
  run(['config', 'user.email', 'test@local']);
  run(['config', 'user.name', 'Test']);
  run(['config', 'commit.gpgsign', 'false']);
  return { dir, run };
}

function commit(dir, run, subject, body = 'x') {
  fs.writeFileSync(path.join(dir, 'x.txt'), `${Date.now()}${body}`);
  run(['add', '-A']);
  run(['commit', '-q', '-m', subject]);
}

function runScript(dir, base) {
  return cp.spawnSync(process.execPath, [SCRIPT], {
    cwd: dir,
    encoding: 'utf-8',
    env: { ...process.env, CHANGELOG_BASE: base },
  });
}

test('changelog-presence passes when CHANGELOG mentions closed ID', () => {
  const { dir, run } = makeTmpRepo();
  commit(dir, run, 'initial');
  const base = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8' }).trim();

  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n- F-099 fixed\n');
  commit(dir, run, 'fix: tiny (closes F-099)');

  const res = runScript(dir, base);
  assert.equal(res.status, 0, `expected exit 0; stderr: ${res.stderr}`);
});

test('changelog-presence fails when CHANGELOG missing closed ID', () => {
  const { dir, run } = makeTmpRepo();
  commit(dir, run, 'initial');
  const base = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8' }).trim();

  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n- nothing\n');
  commit(dir, run, 'fix: orphan (closes F-099)');

  const res = runScript(dir, base);
  assert.equal(res.status, 1, `expected exit 1; stdout: ${res.stdout}, stderr: ${res.stderr}`);
  assert.match(res.stderr, /F-099/);
});

test('changelog-presence fails on BLOCKER without [Unreleased]', () => {
  const { dir, run } = makeTmpRepo();
  commit(dir, run, 'initial');
  const base = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8' }).trim();

  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\n## 0.1.0\n- old\n');
  commit(dir, run, 'fix: BLOCKER drift');

  const res = runScript(dir, base);
  assert.equal(res.status, 1, `expected exit 1; stderr: ${res.stderr}`);
  assert.match(res.stderr, /Unreleased/);
});

test('changelog-presence skips when base ref missing', () => {
  const { dir } = makeTmpRepo();
  const res = runScript(dir, 'nonexistent-ref');
  assert.equal(res.status, 0);
  assert.match(res.stdout, /SKIP/);
});

test('changelog-presence passes on real repo (default base)', () => {
  const res = cp.spawnSync(process.execPath, [SCRIPT], { encoding: 'utf-8' });
  assert.equal(res.status, 0, res.stderr);
});
