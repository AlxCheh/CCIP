'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();

test('aggregate-telemetry runs on Stop BEFORE flush-state', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf-8'));
  const cmds = settings.hooks.Stop.flatMap(b => b.hooks.map(h => h.command));
  const aggIdx = cmds.findIndex(c => /aggregate-telemetry\.js/.test(c));
  const flushIdx = cmds.findIndex(c => /flush-state\.js/.test(c));
  assert.ok(aggIdx >= 0, 'aggregate-telemetry must be a Stop hook');
  assert.ok(flushIdx >= 0, 'flush-state must remain a Stop hook');
  assert.ok(aggIdx < flushIdx, 'aggregate must run before flush clears observations');
});

test('manifest declares INV-TELEMETRY-AGGREGATE', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, '.claude/runtime/governance-manifest.json'), 'utf-8'));
  assert.ok(m.invariants.some(i => i.id === 'INV-TELEMETRY-AGGREGATE'));
});
