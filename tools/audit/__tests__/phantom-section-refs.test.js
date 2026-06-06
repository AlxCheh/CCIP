'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const CHECKER = path.join(root, 'tools/audit/phantom-section-refs.js');

test('phantom-section-refs passes on current repo state', () => {
  const res = cp.spawnSync(process.execPath, [CHECKER], { encoding: 'utf-8', cwd: root });

  // Should pass because phantom references have been fixed (T-16 remediation)
  assert.strictEqual(res.status, 0,
    `phantom-section-refs should pass on current repo state (no phantom refs):\n${res.stderr}`);

  // Check that output confirms success
  const output = res.stdout;
  assert.match(output, /\[PHANTOM-REF\] OK/,
    'should output [PHANTOM-REF] OK');
});

test('phantom-section-refs detects valid CLAUDE.md references', () => {
  const res = cp.spawnSync(process.execPath, [CHECKER], { encoding: 'utf-8', cwd: root });

  // Extract stderr to verify it doesn't complain about §15, §16, §17 (which DO exist)
  const output = res.stderr;
  assert.doesNotMatch(output, /§15|§16|§17/,
    'should not report false positives for valid CLAUDE.md sections (§15, §16, §17)');
});
