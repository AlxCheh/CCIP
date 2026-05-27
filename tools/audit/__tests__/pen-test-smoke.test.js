'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const SCRIPT = path.join(gitRoot(), 'tools/audit/pen-test-smoke.js');

test('pen-test-smoke passes when settings.local.json is absent (CI/clean checkout)', () => {
  const res = cp.spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf-8',
    env: { ...process.env, CCIP_SETTINGS_LOCAL_PATH: '/nonexistent/settings.local.json' },
  });
  assert.equal(res.status, 0, `expected exit 0 when settings missing, got ${res.status}; stderr: ${res.stderr}`);
  assert.match(res.stdout, /\[PEN-SMOKE\] OK/);
});

test('pen-test-smoke flags dangerous patterns in allowlist', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-pen-'));
  const fake = path.join(tmp, 'settings.local.json');
  try {
    fs.writeFileSync(fake, JSON.stringify({
      permissions: { allow: ['Bash(rm -rf /tmp/x)', 'Bash(git status)'] },
    }));
    const res = cp.spawnSync(process.execPath, [SCRIPT], {
      encoding: 'utf-8',
      env: { ...process.env, CCIP_SETTINGS_LOCAL_PATH: fake },
    });
    assert.notEqual(res.status, 0, 'dangerous allowlist pattern must fail');
    assert.match(res.stderr, /rm -rf/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('pen-test-smoke passes on clean allowlist', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-pen-'));
  const fake = path.join(tmp, 'settings.local.json');
  try {
    fs.writeFileSync(fake, JSON.stringify({
      permissions: { allow: ['Bash(git status)', 'Bash(node tools/audit/audit-suite.js)'] },
    }));
    const res = cp.spawnSync(process.execPath, [SCRIPT], {
      encoding: 'utf-8',
      env: { ...process.env, CCIP_SETTINGS_LOCAL_PATH: fake },
    });
    assert.equal(res.status, 0, res.stderr);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
