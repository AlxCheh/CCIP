#!/usr/bin/env node
/**
 * PostToolUse hook (matcher "*") — token-efficiency-auditor trigger detection.
 *
 * Fires after EVERY tool call. Maintains lightweight counters in
 * .claude/audit/trigger-state.json, detects triggers T-06/T-07/T-08/T-10,
 * appends to pending_audit[] and emits an additionalContext nudge so the
 * orchestrator can decide to run /token-audit.
 *
 * Constraints honoured (see docs/proposals/token-auditor-hooks-design.md):
 *   - C1: hook NEVER spawns the agent — it only flags + nudges.
 *   - C6: the auditor's own Agent-completion call clears pending_audit and
 *         never re-triggers (guard against self-trigger loop).
 *   - Fail-silent: any error → exit 0, never blocks the parent session.
 *
 * Triggers requiring raw token-window data (T-03/T-04/T-05) are NOT handled
 * here — no API exposes per-message tokens to hooks.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '../..');
const TSTATE = path.join(ROOT, '.claude/audit/trigger-state.json');
const SSTATE = path.join(ROOT, '.claude/runtime/session-state.json');

const AUDITOR        = 'token-efficiency-auditor';
const T06_THRESHOLD  = 3;   // тот же (path,offset) прочитан ≥ 3 раз
const T07_THRESHOLD  = 15;  // tool-calls в одном turn > 15
const T10_FAILURES   = 2;   // ≥ 2 сбоя агентов
const FAILURE_WINDOW = 5;   // ...за последние 5 вызовов Agent
const COOLDOWN_CALLS = 30;  // не повторять один триггер чаще, чем раз в N tool-calls
const MAX_READ_KEYS  = 400; // верхняя граница read_counts; при превышении — prune синглтонов

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

function responseText(r) {
  if (!r) return '';
  if (typeof r === 'string') return r;
  const c = r.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(x => x.text || x.content || '').join('\n');
  return JSON.stringify(r);
}

/** Append a trigger to pending_audit unless still within cooldown. */
function fireMaybe(st, fired, trigger, reason) {
  const last = st.cooldowns[trigger];
  if (typeof last === 'number' && st.total_calls - last < COOLDOWN_CALLS) return;
  st.cooldowns[trigger] = st.total_calls;
  st.pending_audit.push({ trigger, reason, ts: new Date().toISOString() });
  fired.push({ trigger, reason });
}

let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  try { run(raw); }
  catch (e) { process.stderr.write(`[audit-trigger-hook] FAIL: ${e.message}\n`); }
  process.exit(0);
});

function run(raw) {
  let payload;
  try { payload = JSON.parse(raw); } catch { return; }

  const tool = payload.tool_name;
  if (!tool) return;

  const sid = currentSessionId();
  let st = readJSON(TSTATE) || defaultState(sid);
  // Session resets are owned by the SessionStart hook (audit-session-reset.js),
  // which also stamps session_key. Don't reset here — that would wipe session_key
  // mid-session. Preserve an existing key; only mint one if somehow absent.
  if (!st.session_key) st.session_key = genSessionKey();

  const ti = payload.tool_input || {};
  const isAuditorCall = tool === 'Agent' && ti.subagent_type === AUDITOR;

  // Guard (C6): the auditor just ran → audit consumed, clear backlog, do not re-trigger.
  if (isAuditorCall) {
    st.pending_audit = [];
    st.audit_in_progress = false;
    st.total_calls = (st.total_calls || 0) + 1;
    st.tool_calls_this_turn = (st.tool_calls_this_turn || 0) + 1;
    writeState(st);
    return;
  }

  if (st.audit_in_progress) { writeState(st); return; }

  st.total_calls = (st.total_calls || 0) + 1;
  st.tool_calls_this_turn = (st.tool_calls_this_turn || 0) + 1;

  const fired = [];

  // T-06 — повторное чтение того же (path, offset)
  if (tool === 'Read' && ti.file_path) {
    const key = ti.file_path + ':' + (ti.offset || 0);
    st.read_counts[key] = (st.read_counts[key] || 0) + 1;
    // Bound growth: when the map gets large, drop one-time reads (noise);
    // keep the current key and any repeated-read candidates (count ≥ 2).
    if (Object.keys(st.read_counts).length > MAX_READ_KEYS) {
      for (const k of Object.keys(st.read_counts)) {
        if (k !== key && st.read_counts[k] < 2) delete st.read_counts[k];
      }
    }
    if (st.read_counts[key] >= T06_THRESHOLD) {
      fireMaybe(st, fired, 'T-06', `${key} прочитан ${st.read_counts[key]}×`);
    }
  }

  // T-08 — выход из режима плана
  if (tool === 'ExitPlanMode') {
    fireMaybe(st, fired, 'T-08', 'ExitPlanMode invoked');
  }

  // T-07 — burst tool-calls в одном turn
  if (st.tool_calls_this_turn > T07_THRESHOLD) {
    fireMaybe(st, fired, 'T-07', `${st.tool_calls_this_turn} tool-calls в turn`);
  }

  // T-10 — каскад сбоев агентов
  if (tool === 'Agent') {
    const txt = responseText(payload.tool_response);
    let outcome = 'success';
    const m = txt.match(/"outcome"\s*:\s*"(failed|rerouted|partial|success)"/);
    if (m) outcome = m[1];
    if (payload.tool_response && payload.tool_response.is_error === true) outcome = 'failed';
    st.agent_failures_window.push(outcome);
    if (st.agent_failures_window.length > FAILURE_WINDOW) st.agent_failures_window.shift();
    const fails = st.agent_failures_window.filter(o => o === 'failed').length;
    if (fails >= T10_FAILURES) {
      fireMaybe(st, fired, 'T-10', `${fails} сбоя агентов за ${FAILURE_WINDOW} вызовов`);
    }
  }

  writeState(st);

  if (fired.length) {
    const ctx = '⚡ Token-audit trigger(s): ' + fired.map(f => f.trigger).join(', ') +
      '. Рассмотри запуск /token-audit. ' + fired.map(f => `${f.trigger}: ${f.reason}`).join('; ');
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: ctx },
    }));
  }
}
