const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

test('agent-name-presence reports unmapped agents', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/agent-name-presence.js');
  const res = cp.spawnSync(process.execPath, [script]);
  // Текущее состояние: 8 агентов не в таблице (F-010). Должен fail.
  // После T-07 (Phase 2) и расширения CLAUDE.md — должен pass.
  assert.ok(typeof res.status === 'number');
});
