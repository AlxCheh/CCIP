#!/usr/bin/env node
/**
 * UserPromptSubmit hook — token-efficiency-auditor turn boundary.
 *
 * Fires on each user prompt. Increments turn_index, resets the per-turn
 * tool-call counter (so T-07 measures per-turn, not per-session), and:
 *   T-09: every 20th turn emits a periodic-checkpoint nudge.
 *   T-02: detects session-end phrases and emits the ccip-session-optimizer
 *         → token-efficiency-auditor chaining reminder (ADR-016, Phase C).
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

const SESSION_END_RE = /завершаем сессию|закрываем сессию|end session|\/session-end/i;

function genSessionKey() {
  const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const hex = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${ts}-${hex}`;
}

function defaultState(sid) {
  return {
    session_id: sid || '',
    session_key: genSessionKey(),
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

// SPOF-3: validate trigger-state schema; fall back to defaultState on corrupt/incomplete state
const TRIGGER_REQUIRED = ['session_id', 'total_calls', 'turn_index', 'tool_calls_this_turn'];
function validateTriggerState(st, sid) {
  const missing = TRIGGER_REQUIRED.filter(k => !(k in st));
  if (missing.length === 0) return st;
  process.stderr.write(`[audit-turn-hook] trigger-state missing fields: ${missing.join(', ')} — using defaultState\n`);
  return defaultState(sid);
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

function extractPromptText(raw) {
  if (!raw) return '';
  try {
    const p = JSON.parse(raw);
    if (typeof p.prompt === 'string') return p.prompt;
  } catch { /* treat as plain text */ }
  return raw;
}

let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  try { run(raw); }
  catch (e) { process.stderr.write(`[audit-turn-hook] FAIL: ${e.message}\n`); }
  process.exit(0);
});

function run(rawInput) {
  const promptText = extractPromptText(rawInput || '');
  const sid = currentSessionId();
  let st = validateTriggerState(readJSON(TSTATE) || defaultState(sid), sid);
  if (!st.session_key) st.session_key = genSessionKey();   // SessionStart owns resets

  st.turn_index = (st.turn_index || 0) + 1;
  st.tool_calls_this_turn = 0;          // reset per-turn counter (T-07)

  const nudges = [];

  // T-02: session-end phrase → remind orchestrator to chain session-optimizer + auditor
  if (SESSION_END_RE.test(promptText)) {
    st.pending_audit.push({
      trigger: 'T-02',
      reason: 'session-end phrase detected',
      ts: new Date().toISOString(),
    });
    nudges.push(
      '⚡ T-02 (session-end): (1) ccip-session-optimizer → (2) token-efficiency-auditor' +
      ' (recorder→count→propose). Порядок зафиксирован (ADR-016, T-02 depends_on ccip-session-optimizer).'
    );
  }

  // T-09: periodic checkpoint every 20 turns
  if (st.turn_index > 0 && st.turn_index % T09_EVERY === 0) {
    st.pending_audit.push({
      trigger: 'T-09',
      reason: `периодический чекпойнт (turn ${st.turn_index})`,
      ts: new Date().toISOString(),
    });
    nudges.push(`⚡ Token-audit trigger T-09: периодический чекпойнт (turn ${st.turn_index}). Рассмотри запуск /token-audit.`);
  }

  writeState(st);

  if (nudges.length) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: nudges.join('\n') },
    }));
  }
}

if (require.main !== module) module.exports = { validateTriggerState, defaultState };
