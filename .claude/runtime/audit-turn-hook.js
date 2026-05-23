#!/usr/bin/env node
/**
 * UserPromptSubmit hook — token-efficiency-auditor turn boundary.
 *
 * Fires on each user prompt. Increments turn_index, resets the per-turn
 * tool-call counter (so T-07 measures per-turn, not per-session), and on
 * every 20th turn emits a periodic-checkpoint nudge (T-09).
 *
 * Note (C5): context compaction does not emit UserPromptSubmit, so turn_index
 * is approximate. T-09 is periodic-by-design, so drift is acceptable (Q4).
 *
 * Fail-silent: any error → exit 0, never blocks the prompt.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '../..');
const TSTATE = path.join(ROOT, '.claude/audit/trigger-state.json');
const SSTATE = path.join(ROOT, '.claude/runtime/session-state.json');

const T09_EVERY = 20;

function defaultState(sid) {
  return {
    session_id: sid || '',
    total_calls: 0,
    turn_index: 0,
    tool_calls_this_turn: 0,
    read_counts: {},
    agent_failures_window: [],
    audit_in_progress: false,
    pending_audit: [],
    cooldowns: {},
  };
}

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch { return null; }
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

function currentSessionId() {
  const s = readJSON(SSTATE);
  return (s && s.session_id) || '';
}

let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  try { run(); }
  catch (e) { process.stderr.write(`[audit-turn-hook] FAIL: ${e.message}\n`); }
  process.exit(0);
});

function run() {
  const sid = currentSessionId();
  let st = readJSON(TSTATE) || defaultState(sid);
  if (st.session_id !== sid) st = defaultState(sid);

  st.turn_index = (st.turn_index || 0) + 1;
  st.tool_calls_this_turn = 0;          // reset per-turn counter (T-07)

  let nudge = '';
  if (st.turn_index > 0 && st.turn_index % T09_EVERY === 0) {
    st.pending_audit.push({
      trigger: 'T-09',
      reason: `периодический чекпойнт (turn ${st.turn_index})`,
      ts: new Date().toISOString(),
    });
    nudge = `⚡ Token-audit trigger T-09: периодический чекпойнт (turn ${st.turn_index}). Рассмотри запуск /token-audit.`;
  }

  writeState(st);

  if (nudge) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: nudge },
    }));
  }
}
