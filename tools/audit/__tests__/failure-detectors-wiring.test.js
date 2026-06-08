'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();

test('failure-detectors runs on Stop AFTER aggregate-telemetry and BEFORE flush-state', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf-8'));
  const cmds = settings.hooks.Stop.flatMap(b => b.hooks.map(h => h.command));
  const aggIdx  = cmds.findIndex(c => /aggregate-telemetry\.js/.test(c));
  const detIdx  = cmds.findIndex(c => /failure-detectors\.js/.test(c));
  const flushIdx = cmds.findIndex(c => /flush-state\.js/.test(c));
  assert.ok(detIdx >= 0, 'failure-detectors must be a Stop hook');
  assert.ok(aggIdx < detIdx, 'failure-detectors must run after aggregate-telemetry');
  assert.ok(detIdx < flushIdx, 'failure-detectors must run before flush-state');
});

test('manifest declares INV-FAILURE-DETECTOR', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, '.claude/runtime/governance-manifest.json'), 'utf-8'));
  assert.ok(m.invariants.some(i => i.id === 'INV-FAILURE-DETECTOR'), 'manifest must declare INV-FAILURE-DETECTOR');
});
