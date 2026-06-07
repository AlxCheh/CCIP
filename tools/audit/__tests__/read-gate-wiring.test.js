'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();

test('read-gate is registered as a PreToolUse[Read] hook', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf-8'));
  const block = (settings.hooks.PreToolUse || []).find(b => /Read/.test(b.matcher || ''));
  assert.ok(block, 'a PreToolUse block matching Read must exist');
  assert.match(block.hooks.map(h => h.command).join(' '), /read-gate\.js/);
});

test('manifest declares INV-READING-DISCIPLINE in shadow status', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, '.claude/runtime/governance-manifest.json'), 'utf-8'));
  const inv = m.invariants.find(i => i.id === 'INV-READING-DISCIPLINE');
  assert.ok(inv, 'INV-READING-DISCIPLINE must be declared');
  assert.strictEqual(inv.kind, 'block');
  assert.strictEqual(inv.status, 'shadow');
});
