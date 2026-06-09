'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();

test('pre-agent-gate is registered as a PreToolUse[Agent] hook', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf-8'));
  const pre = settings.hooks.PreToolUse || [];
  const agentBlock = pre.find(b => b.matcher === 'Agent');
  assert.ok(agentBlock, 'PreToolUse[Agent] block must exist');
  const cmds = agentBlock.hooks.map(h => h.command).join(' ');
  assert.match(cmds, /pre-agent-gate\.js/, 'gate must be wired into PreToolUse[Agent]');
});

test('manifest declares the two block invariants in shadow status', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, '.claude/runtime/governance-manifest.json'), 'utf-8'));
  const ids = m.invariants.map(i => i.id);
  for (const id of ['INV-AGENT-BUDGET', 'INV-SECURITY-COAGENT'])
    assert.ok(ids.includes(id), `manifest must declare ${id}`);
  for (const inv of m.invariants.filter(i => ['INV-AGENT-BUDGET', 'INV-SECURITY-COAGENT'].includes(i.id))) {
    assert.strictEqual(inv.kind, 'block');
    assert.ok(['shadow','enforced'].includes(inv.status), `status must be shadow or enforced, got ${inv.status}`);
  }
});
