'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const HOOK = path.join(root, '.claude/runtime/audit-session-reset.js');
const SSTATE = path.join(root, '.claude/runtime/session-state.json');

function backupState(file) {
  const original = fs.readFileSync(file, 'utf-8');
  return () => fs.writeFileSync(file, original, 'utf-8');
}

test('SessionStart hook initialises session_id when empty', () => {
  const restoreS = backupState(SSTATE);
  try {
    const emptyState = JSON.parse(fs.readFileSync(SSTATE, 'utf-8'));
    emptyState.session_id = '';
    fs.writeFileSync(SSTATE, JSON.stringify(emptyState), 'utf-8');

    cp.spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({}), encoding: 'utf-8'
    });

    const after = JSON.parse(fs.readFileSync(SSTATE, 'utf-8'));
    assert.match(after.session_id, /^\d{4}-\d{2}-\d{2}-\d{4}$/,
      'session_id must be initialised to YYYY-MM-DD-HHMM format');
  } finally {
    restoreS();
  }
});

test('audit-session-reset prunes governance_alerts to last 10', () => {
  const restoreS = backupState(SSTATE);
  try {
    const state = JSON.parse(fs.readFileSync(SSTATE, 'utf-8'));
    state.governance_alerts = Array.from({ length: 15 }, (_, i) => ({
      kind: 'test_alert', at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`, session: 's'
    }));
    fs.writeFileSync(SSTATE, JSON.stringify(state, null, 2));

    cp.spawnSync(process.execPath, [HOOK], { input: '{}', encoding: 'utf-8' });

    const after = JSON.parse(fs.readFileSync(SSTATE, 'utf-8'));
    assert.ok(after.governance_alerts.length <= 10,
      `expected <= 10 alerts, got ${after.governance_alerts.length}`);
    assert.strictEqual(
      after.governance_alerts[after.governance_alerts.length - 1].at,
      '2026-01-15T00:00:00Z', 'last alert must be the most recent'
    );
  } finally {
    restoreS();
  }
});

test('SessionStart hook preserves non-empty session_id', () => {
  const restoreS = backupState(SSTATE);
  try {
    const existingState = JSON.parse(fs.readFileSync(SSTATE, 'utf-8'));
    existingState.session_id = '2026-01-01-1200';
    fs.writeFileSync(SSTATE, JSON.stringify(existingState), 'utf-8');

    cp.spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({}), encoding: 'utf-8'
    });

    const after = JSON.parse(fs.readFileSync(SSTATE, 'utf-8'));
    assert.strictEqual(after.session_id, '2026-01-01-1200',
      'existing session_id must not be overwritten');
  } finally {
    restoreS();
  }
});
