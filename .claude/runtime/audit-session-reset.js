#!/usr/bin/env node
/**
 * SessionStart hook — reset token-auditor trigger-state at the start of each session.
 *
 * Why: trigger-state is scoped by session_id, but in this repo
 * session-state.json.session_id is frequently "" (uninitialised), so the
 * in-hook session_id comparison never detects a new session and counters
 * accumulate across sessions (false T-06/T-09, unbounded read_counts).
 * SessionStart is the reliable boundary — reset unconditionally here.
 *
 * Fail-silent: any error → exit 0, never blocks session start.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '../..');
const TSTATE = path.join(ROOT, '.claude/audit/trigger-state.json');
const SSTATE = path.join(ROOT, '.claude/runtime/session-state.json');

function currentSessionId() {
  try {
    const s = JSON.parse(fs.readFileSync(SSTATE, 'utf-8'));
    return (s && s.session_id) || '';
  } catch { return ''; }
}

function writeState(state) {
  const tmp = TSTATE + '.tmp.' + process.pid;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, JSON.stringify(state, null, 2) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmp, TSTATE);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }
}

// Drain stdin (SessionStart delivers a JSON payload) before resetting.
let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  try {
    writeState({
      session_id: currentSessionId(),
      total_calls: 0,
      turn_index: 0,
      tool_calls_this_turn: 0,
      read_counts: {},
      agent_failures_window: [],
      audit_in_progress: false,
      pending_audit: [],
      cooldowns: {},
    });
  } catch (e) {
    process.stderr.write(`[audit-session-reset] FAIL: ${e.message}\n`);
  }
  process.exit(0);
});
