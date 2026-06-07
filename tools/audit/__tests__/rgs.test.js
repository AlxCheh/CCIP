'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();
const RGS = path.join(root, 'tools/audit/rgs.js');
const { computeEC } = require(RGS);

test('computeEC = enforced share of invariants', () => {
  const m = { invariants: [
    { kind: 'block' }, { kind: 'signal' }, { kind: 'advisory' }, { kind: 'signal' },
  ] };
  assert.strictEqual(computeEC(m), 0.75); // 3 of 4 are block|signal
});

test('rgs.js prints EC + TI + composite and exits 0 (advisory)', () => {
  const res = cp.spawnSync(process.execPath, [RGS], { encoding: 'utf-8', cwd: root });
  assert.strictEqual(res.status, 0);
  assert.match(res.stdout, /\[RGS\]/);
  assert.match(res.stdout, /EC=/);
  assert.match(res.stdout, /TI=/);
});

test('computeCCR = 1 - missing/total observations', () => {
  const { computeCCR } = require(RGS);
  // 3 obs, 1 missing → CCR = 0.67
  const obs = [
    { missing_state_update: false },
    { missing_state_update: false },
    { missing_state_update: true },
  ];
  assert.strictEqual(computeCCR(obs), 0.67);
  assert.strictEqual(computeCCR([]), null); // no data → null (skip)
});

test('computeFC = 1 when events exist, 0 when empty, null when state empty', () => {
  const { computeFC } = require(RGS);
  // has events and observations → FC=1
  assert.strictEqual(computeFC([{ tool: 'Read' }], [{ agent: 'a' }]), 1);
  // has observations but no events → FC=0
  assert.strictEqual(computeFC([], [{ agent: 'a' }]), 0);
  // no activity → null (idle session, skip)
  assert.strictEqual(computeFC([], []), null);
});

test('rgs.js full output includes CCR and FC when state file provided', () => {
  const os = require('os');
  const fs = require('fs');
  const stateFile = path.join(os.tmpdir(), `rgs-state-${Date.now()}.json`);
  fs.writeFileSync(stateFile, JSON.stringify({
    session_id: 's', observations: [
      { missing_state_update: false }, { missing_state_update: false },
    ],
  }), 'utf-8');
  const eventsFile = path.join(os.tmpdir(), `rgs-events-${Date.now()}.jsonl`);
  fs.writeFileSync(eventsFile, JSON.stringify({ tool: 'Read', ts: new Date().toISOString() }) + '\n', 'utf-8');
  try {
    const res = cp.spawnSync(process.execPath, [RGS], {
      encoding: 'utf-8', cwd: root,
      env: { ...process.env, CCIP_STATE_FILE: stateFile, CCIP_EVENTS_FILE: eventsFile },
    });
    assert.strictEqual(res.status, 0);
    assert.match(res.stdout, /CCR=/);
    assert.match(res.stdout, /FC=/);
  } finally {
    fs.rmSync(stateFile, { force: true });
    fs.rmSync(eventsFile, { force: true });
  }
});
