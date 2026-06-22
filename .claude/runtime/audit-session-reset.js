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
const { updateStateLocked } = require('./state-io'); // HA-2: locked SSTATE writes

const ROOT   = path.resolve(__dirname, '../..');
const TSTATE = path.join(ROOT, '.claude/audit/trigger-state.json');
const SSTATE = path.join(ROOT, '.claude/runtime/session-state.json');

function currentSessionId() {
  try {
    const s = JSON.parse(fs.readFileSync(SSTATE, 'utf-8'));
    return (s && s.session_id) || '';
  } catch { return ''; }
}

/** Readable, sortable, low-collision session key: ISO timestamp + 4 hex.
 *  Example: 2026-05-23T14:02:11Z-a3f9. Used by T-02 for history idempotency. */
function genSessionKey() {
  const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const hex = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${ts}-${hex}`;
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
      session_key: genSessionKey(),   // always fresh — no reuse across sessions (idempotency)
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

  // Auto-init session-state.json: set session_id if currently empty (audit C-05).
  // Idempotent — preserves existing session_id to avoid mid-session reset.
  try {
    updateStateLocked(SSTATE, (sState) => {
      if (sState.session_id) return; // already initialised — don't reset mid-session (idempotent)
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const sessionId =
        `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}` +
        `-${pad(now.getHours())}${pad(now.getMinutes())}`;
      sState.session_id = sessionId;
      sState.started_at = now.toISOString();
      sState.status = 'planning';
      // Reset session-scoped fields at session start (D-10: stale state from crashed session)
      sState.observations = [];
      sState.agent_outputs = {};
      sState.dag = [];
      sState.current_step = 0;
      sState.inflight_spawns = []; // E-2: clear stale in-flight markers from a crashed session
    });
  } catch (e) {
    process.stderr.write(`[audit-session-reset] session-state init fail: ${e.message}\n`);
  }

  // Prune governance_alerts to last 10 entries (D-09: unbounded growth). HA-2: under lock.
  const MAX_ALERTS = 10;
  try {
    updateStateLocked(SSTATE, (sState2) => {
      if (Array.isArray(sState2.governance_alerts) && sState2.governance_alerts.length > MAX_ALERTS) {
        sState2.governance_alerts = sState2.governance_alerts.slice(-MAX_ALERTS);
      }
    });
  } catch (e) {
    process.stderr.write(`[audit-session-reset] alerts-prune fail: ${e.message}\n`);
  }

  // Increment quarantine rule counters for non-transcript-blocked rules (D-17)
  try {
    const { incrementQuarantineCounters } = require('./quarantine-increment');
    incrementQuarantineCounters();
  } catch (e) {
    process.stderr.write(`[audit-session-reset] quarantine-increment: ${e.message}\n`);
  }

  process.exit(0);
});
