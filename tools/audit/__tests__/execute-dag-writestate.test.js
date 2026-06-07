'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const STATE = path.join(root, '.claude/runtime/session-state.json');
const { writeState } = require(path.join(root, '.claude/runtime/execute-dag.js'));

function backupState() {
  const original = fs.readFileSync(STATE, 'utf-8');
  return () => fs.writeFileSync(STATE, original, 'utf-8');
}

test('writeState produces parseable JSON and leaves no bare .tmp leftover', () => {
  const restore = backupState();
  try {
    writeState({ session_id: '2026-01-01-1200', task: 'wt-test', marker: 42 });
    const after = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
    assert.strictEqual(after.marker, 42);
    // F-RT-01: tmp must be PID-scoped, never the shared bare ".tmp"
    assert.ok(!fs.existsSync(STATE + '.tmp'),
      'bare session-state.json.tmp must not exist (PID-scoped tmp required)');
  } finally {
    restore();
  }
});

test('writeState cleans up its PID tmp file after rename', () => {
  const restore = backupState();
  try {
    writeState({ session_id: '2026-01-01-1200', task: 'wt-test2' });
    assert.ok(!fs.existsSync(STATE + '.tmp.' + process.pid),
      'PID tmp must be renamed away, not left behind');
  } finally {
    restore();
  }
});
