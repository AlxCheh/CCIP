'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const DAG = path.join(root, '.claude/runtime/execute-dag.js');

// SKIP_PERMS is read from process.argv at require-time, so each case runs in a
// fresh subprocess. Args placed AFTER the script path land in process.argv as
// script args (not node options), which is how the real CLI receives the flag.
function inspectArgs(extraArgs) {
  const probe = path.join(os.tmpdir(), `dag-probe-${process.pid}-${Math.random().toString(36).slice(2)}.js`);
  fs.writeFileSync(probe,
    `const { buildClaudeArgs } = require(${JSON.stringify(DAG)});\n` +
    `console.log(JSON.stringify(buildClaudeArgs()));\n`);
  try {
    const r = cp.spawnSync(process.execPath, [probe, ...extraArgs], { encoding: 'utf-8' });
    assert.strictEqual(r.status, 0, r.stderr);
    return JSON.parse(r.stdout.trim());
  } finally {
    fs.unlinkSync(probe);
  }
}

test('buildClaudeArgs excludes --dangerously-skip-permissions by default (T-15)', () => {
  const args = inspectArgs([]);
  assert.deepEqual(args, ['--print'],
    'default run must NOT pass --dangerously-skip-permissions to claude');
});

test('buildClaudeArgs adds --dangerously-skip-permissions only with --skip-permissions (T-15)', () => {
  const args = inspectArgs(['--skip-permissions']);
  assert.ok(args.includes('--dangerously-skip-permissions'),
    '--skip-permissions opt-in must propagate to claude CLI args');
  assert.deepEqual(args, ['--print', '--dangerously-skip-permissions']);
});
