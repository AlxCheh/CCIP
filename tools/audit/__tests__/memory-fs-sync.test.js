const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const SCRIPT = path.join(root, 'tools/audit/memory-fs-sync.js');

function runWith(env) {
  return cp.spawnSync(process.execPath, [SCRIPT], {
    env: { ...process.env, ...env },
    encoding: 'utf-8',
  });
}

test('memory-fs-sync passes when CCIP_USER_MEMORY_DIR is unset and repo has no MEMORY.md', () => {
  // env-key unset => script skips silently
  const env = { ...process.env };
  delete env.CCIP_USER_MEMORY_DIR;
  const res = cp.spawnSync(process.execPath, [SCRIPT], { env, encoding: 'utf-8' });
  assert.equal(res.status, 0, `stderr: ${res.stderr}`);
});

test('memory-fs-sync passes against real user memory dir', () => {
  const userDir = 'C:/Users/user/.claude/projects/W--Claude-CCIP/memory';
  if (!fs.existsSync(path.join(userDir, 'MEMORY.md'))) {
    // env-specific; if absent on this host, skip
    return;
  }
  const res = runWith({ CCIP_USER_MEMORY_DIR: userDir });
  assert.equal(res.status, 0, `stderr: ${res.stderr}`);
});

test('memory-fs-sync detects broken refs', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memfs-'));
  try {
    fs.writeFileSync(
      path.join(tmp, 'MEMORY.md'),
      '- [Existing](real.md) — ok\n- [Missing](ghost.md) — should fail\n',
      'utf-8'
    );
    fs.writeFileSync(path.join(tmp, 'real.md'), '# real\n', 'utf-8');
    const res = runWith({ CCIP_USER_MEMORY_DIR: tmp });
    assert.notEqual(res.status, 0, 'expected non-zero exit when a ref is missing');
    assert.match(res.stderr, /ghost\.md/, 'stderr should name the missing ref');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
