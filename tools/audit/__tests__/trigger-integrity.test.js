'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const AUDIT = path.join(root, 'tools/audit/trigger-integrity.js');

test('trigger-integrity passes on the real repo manifest', () => {
  const res = cp.spawnSync(process.execPath, [AUDIT], { encoding: 'utf-8', cwd: root });
  assert.strictEqual(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /\[TRIGGER-INTEGRITY\] OK/);
});

test('trigger-integrity fails when an enforcement marker is missing', () => {
  const tmp = path.join(os.tmpdir(), `manifest-${Date.now()}-a.json`);
  fs.writeFileSync(tmp, JSON.stringify({ invariants: [{
    id: 'INV-FAKE', claim: 'x', doc_anchor: '§15',
    enforcement: 'post-agent-hook.js#INV-DOES-NOT-EXIST',
    kind: 'signal', status: 'observed' }] }), 'utf-8');
  try {
    const res = cp.spawnSync(process.execPath, [AUDIT],
      { encoding: 'utf-8', cwd: root, env: { ...process.env, CCIP_MANIFEST_FILE: tmp } });
    assert.notStrictEqual(res.status, 0, 'must fail on missing marker');
    assert.match(res.stdout + res.stderr, /INV-DOES-NOT-EXIST|marker/i);
  } finally { fs.rmSync(tmp, { force: true }); }
});

test('trigger-integrity fails when doc_anchor is absent from CLAUDE.md', () => {
  const tmp = path.join(os.tmpdir(), `manifest-${Date.now()}-b.json`);
  fs.writeFileSync(tmp, JSON.stringify({ invariants: [{
    id: 'INV-FAKE', claim: 'x', doc_anchor: '§-no-such-anchor-zzz',
    enforcement: 'post-agent-hook.js#INV-STATE-CONTRACT',
    kind: 'signal', status: 'observed' }] }), 'utf-8');
  try {
    const res = cp.spawnSync(process.execPath, [AUDIT],
      { encoding: 'utf-8', cwd: root, env: { ...process.env, CCIP_MANIFEST_FILE: tmp } });
    assert.notStrictEqual(res.status, 0, 'must fail on missing doc_anchor');
    assert.match(res.stdout + res.stderr, /doc_anchor/i);
  } finally { fs.rmSync(tmp, { force: true }); }
});
