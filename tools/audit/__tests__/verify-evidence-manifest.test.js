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

test('M-3: parseManifest flattens v2 trust-split into a single invariants view', () => {
  const yaml = [
    'verified:',
    '  bootstrap_claims: 1',
    '  evidence_rows: 1',
    'self_declared:',
    '  preflight_tokens: 2900',
    '  coverage: full',
  ].join('\n');
  const inv = mod.parseManifest(yaml);
  assert.strictEqual(inv.bootstrap_claims, 1);
  assert.strictEqual(inv.evidence_rows, 1);
  assert.strictEqual(inv.preflight_tokens, 2900);
  assert.strictEqual(inv._self_declared_keys.includes('preflight_tokens'), true);
});

test('D1: parseManifest reads canonical machine_checked + meta keys', () => {
  const yaml = [
    'machine_checked:',
    '  bootstrap_claims: 2',
    '  evidence_rows: 2',
    'meta:',
    '  trigger_match: \'exact:"x"\'',
    'self_declared:',
    '  coverage: partial',
  ].join('\n');
  const inv = mod.parseManifest(yaml);
  assert.strictEqual(inv.bootstrap_claims, 2);
  assert.strictEqual(inv.evidence_rows, 2);
  assert.strictEqual(inv.trigger_match, 'exact:"x"');
  assert.strictEqual(inv.coverage, 'partial');
  assert.ok(inv._self_declared_keys.includes('coverage'));
});

test('D2: parseManifest flattens invariants-wrapped v2 (machine_checked nested)', () => {
  const yaml = [
    'invariants:',
    '  machine_checked:',
    '    bootstrap_claims: 3',
    '    evidence_rows: 3',
    '  self_declared:',
    '    preflight_calls: 4',
  ].join('\n');
  const inv = mod.parseManifest(yaml);
  assert.strictEqual(inv.bootstrap_claims, 3);
  assert.strictEqual(inv.evidence_rows, 3);
  assert.strictEqual(inv.preflight_calls, 4);
  assert.ok(inv._self_declared_keys.includes('preflight_calls'));
});
