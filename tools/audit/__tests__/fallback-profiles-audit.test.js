'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();
const AUDIT = path.join(root, 'tools/audit/fallback-profiles.js');

test('fallback-profiles audit passes on the real repo profiles', () => {
  const res = cp.spawnSync(process.execPath, [AUDIT], { encoding: 'utf-8', cwd: root });
  assert.strictEqual(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /\[FALLBACK-PROFILES\] OK/);
});

test('fallback-profiles audit fails on a missing domain anchor', () => {
  const tmp = path.join(os.tmpdir(), `profiles-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ 'ccip-x': { invariants: ['x'], domain_anchors: ['docs/does-not-exist.md'] } }), 'utf-8');
  try {
    const res = cp.spawnSync(process.execPath, [AUDIT], { encoding: 'utf-8', cwd: root,
      env: { ...process.env, CCIP_FALLBACK_PROFILES_FILE: tmp } });
    assert.notStrictEqual(res.status, 0);
    assert.match(res.stdout + res.stderr, /does-not-exist|anchor/i);
  } finally { fs.rmSync(tmp, { force: true }); }
});
