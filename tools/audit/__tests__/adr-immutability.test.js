const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const SCRIPT = path.join(gitRoot(), 'tools/audit/adr-immutability.js');

function makeTmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adr-immut-'));
  const run = (args) => cp.execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  run(['init', '-q', '-b', 'main']);
  run(['config', 'user.email', 'test@local']);
  run(['config', 'user.name', 'Test']);
  run(['config', 'commit.gpgsign', 'false']);
  fs.mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  return { dir, run };
}

function writeAdr(dir, status, body) {
  const content = `---\nadr: ADR-099\nstatus: ${status}\nimpl_anchors: []\n---\n\n${body}\n`;
  fs.writeFileSync(path.join(dir, 'docs/decisions/ADR-099-test.md'), content);
}

function runScript(dir, base) {
  return cp.spawnSync(process.execPath, [SCRIPT], {
    cwd: dir,
    encoding: 'utf-8',
    env: { ...process.env, ADR_IMMUT_BASE: base },
  });
}

test('adr-immutability blocks edit of Принято ADR without status bump', () => {
  const { dir, run } = makeTmpRepo();
  writeAdr(dir, 'Принято', 'Initial body.');
  run(['add', '-A']);
  run(['commit', '-q', '-m', 'initial']);
  const base = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8' }).trim();

  writeAdr(dir, 'Принято', 'Modified body without rev bump.');
  run(['add', '-A']);
  run(['commit', '-q', '-m', 'illegal edit']);

  const res = runScript(dir, base);
  assert.equal(res.status, 1, `expected exit 1, got ${res.status}; stderr: ${res.stderr}`);
  assert.match(res.stderr, /ADR-IMMUT/);
});

test('adr-immutability allows edit when status bumps to rev N+1', () => {
  const { dir, run } = makeTmpRepo();
  writeAdr(dir, 'Принято', 'Initial body.');
  run(['add', '-A']);
  run(['commit', '-q', '-m', 'initial']);
  const base = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8' }).trim();

  writeAdr(dir, 'Принято rev 2', 'Modified body.');
  run(['add', '-A']);
  run(['commit', '-q', '-m', 'legal rev bump']);

  const res = runScript(dir, base);
  assert.equal(res.status, 0, `expected exit 0, got ${res.status}; stderr: ${res.stderr}`);
});

test('adr-immutability skips when base ref missing', () => {
  const { dir } = makeTmpRepo();
  const res = runScript(dir, 'nonexistent-ref');
  assert.equal(res.status, 0);
  assert.match(res.stdout, /SKIP/);
});

test('adr-immutability passes on real repo (default base)', () => {
  const res = cp.spawnSync(process.execPath, [SCRIPT], { encoding: 'utf-8' });
  assert.equal(res.status, 0, res.stderr);
});

// --staged mode tests
function runStagedScript(dir) {
  return cp.spawnSync(process.execPath, [SCRIPT, '--staged'], {
    cwd: dir,
    encoding: 'utf-8',
  });
}

test('--staged: blocks staging modification of accepted ADR without status bump', () => {
  const { dir, run } = makeTmpRepo();
  writeAdr(dir, 'Принято', 'Initial body.');
  run(['add', '-A']);
  run(['commit', '-q', '-m', 'initial']);

  writeAdr(dir, 'Принято', 'Modified body without rev bump.');
  run(['add', '-A']); // stage the change

  const res = runStagedScript(dir);
  assert.equal(res.status, 1, `expected exit 1, got ${res.status}; stderr: ${res.stderr}`);
  assert.match(res.stderr, /BLOCK/);
});

test('--staged: allows staging modification when status bumped', () => {
  const { dir, run } = makeTmpRepo();
  writeAdr(dir, 'Принято', 'Initial body.');
  run(['add', '-A']);
  run(['commit', '-q', '-m', 'initial']);

  writeAdr(dir, 'Принято rev 2', 'Modified body.');
  run(['add', '-A']);

  const res = runStagedScript(dir);
  assert.equal(res.status, 0, `expected exit 0; stderr: ${res.stderr}`);
});

test('--staged: allows staging new ADR file (not in HEAD)', () => {
  const { dir, run } = makeTmpRepo();
  // empty initial commit so HEAD exists
  fs.writeFileSync(path.join(dir, 'README.md'), 'init');
  run(['add', '-A']);
  run(['commit', '-q', '-m', 'init']);

  writeAdr(dir, 'Принято', 'Brand new ADR.');
  run(['add', '-A']);

  const res = runStagedScript(dir);
  assert.equal(res.status, 0, `new file should pass; stderr: ${res.stderr}`);
});

test('--staged: exits 0 when no ADR files staged', () => {
  const { dir, run } = makeTmpRepo();
  fs.writeFileSync(path.join(dir, 'README.md'), 'init');
  run(['add', '-A']);
  run(['commit', '-q', '-m', 'init']);

  fs.writeFileSync(path.join(dir, 'README.md'), 'changed');
  run(['add', '-A']);

  const res = runStagedScript(dir);
  assert.equal(res.status, 0);
});
