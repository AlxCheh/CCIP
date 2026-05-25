const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const src = fs.readFileSync(path.join(gitRoot(), '.claude/runtime/verify-evidence-log.js'), 'utf-8');

test('M-6: every execSync/execFileSync call passes a timeout option', () => {
  const calls = src.match(/exec(?:File)?Sync\([\s\S]*?\}\s*\)/g) || [];
  assert.ok(calls.length >= 3, 'expected ≥3 git invocations');
  for (const c of calls) {
    assert.match(c, /timeout:\s*\d+/, `git call missing timeout:\n${c}`);
  }
});
