const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');
const mod = require(path.join(gitRoot(), '.claude/runtime/verify-evidence-log.js'));

test('M-4: parseManifest handles nested invariants block via js-yaml', () => {
  const yaml = [
    'invariants:',
    '  bootstrap_claims: 2',
    '  evidence_rows: 2',
    '  coverage: full',
    "  plan_files: ['docs/plans/a,b.md']",   // запятая в пути ломала старый split
  ].join('\n');
  const inv = mod.parseManifest(yaml);
  assert.strictEqual(inv.bootstrap_claims, 2);
  assert.strictEqual(inv.evidence_rows, 2);
  assert.deepStrictEqual(inv.plan_files, ['docs/plans/a,b.md']);
});
