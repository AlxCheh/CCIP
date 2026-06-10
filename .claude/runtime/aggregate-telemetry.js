#!/usr/bin/env node
'use strict';
// Stop hook (RFC R5): per-session metrics rollup. Reads observations + events.jsonl,
// writes a §5 line in feedback-loop.md. MUST run BEFORE flush-state (which clears
// observations). Idempotent; fail-open.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');
const STATE_FILE = process.env.CCIP_STATE_FILE || path.join(ROOT, '.claude/runtime/session-state.json');
const EVENTS_FILE = process.env.CCIP_EVENTS_FILE || path.join(ROOT, '.claude/runtime/events.jsonl');
const FEEDBACK_FILE = process.env.CCIP_FEEDBACK_FILE || path.join(ROOT, 'docs/tasks/feedback-loop.md');
const SECTION = '## 5. Session Metrics';

function run() {
  let state;
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch { return; }

  const observations = state.observations || [];
  let events = [];
  try {
    events = fs.readFileSync(EVENTS_FILE, 'utf-8').trim().split('\n').filter(Boolean).map(JSON.parse);
  } catch { events = []; }

  // [INV-TELEMETRY-AGGREGATE] RFC R5 — events + observations → session metrics
  const sessionId = state.session_id || 'unknown';
  // T-1/UU-3: events.jsonl accumulates across sessions; count only THIS session's events.
  // Skip the filter when session_id is uninitialised ('unknown') — graceful degrade.
  if (sessionId && sessionId !== 'unknown') {
    events = events.filter(e => e && e.session === sessionId);
  }
  const agents = observations.filter(o => o && o.agent).length;
  const missing = observations.filter(o => o && o.missing_state_update === true).length;
  const ssc = agents ? Number(((agents - missing) / agents).toFixed(2)) : 1;
  const toolCalls = events.length;
  const fullReads = events.filter(e => e && e.full_read === true).length;
  const inline = toolCalls > 0;

  if (agents === 0 && toolCalls === 0) return; // nothing happened this session

  const line = `> 📊 ${sessionId.slice(0, 10)}: tool_calls=${toolCalls} full_reads=${fullReads}`
    + ` agents=${agents} SSC=${ssc} inline=${inline}`;
  const idemKey = `metrics:${sessionId}:${crypto.createHash('sha1')
    .update(`${toolCalls}|${fullReads}|${agents}|${missing}`).digest('hex').slice(0, 8)}`;

  let feedback = '';
  try { feedback = fs.readFileSync(FEEDBACK_FILE, 'utf-8'); } catch {}

  if (!feedback.includes(SECTION)) {
    feedback += `\n\n---\n\n${SECTION}\n\nПер-сессионные метрики (автофлаш при Stop, до flush-state):\n`;
    try {
      fs.mkdirSync(path.dirname(FEEDBACK_FILE), { recursive: true });
      fs.writeFileSync(FEEDBACK_FILE, feedback, 'utf-8');
    } catch (e) { process.stderr.write(`[aggregate-telemetry] ${e.message}\n`); return; }
  }

  if (fs.readFileSync(FEEDBACK_FILE, 'utf-8').includes(idemKey)) {
    process.stderr.write(`[aggregate-telemetry] ⏭ ${idemKey} already flushed — skip\n`);
    return;
  }
  fs.appendFileSync(FEEDBACK_FILE, `\n<!-- ${idemKey} -->\n${line}\n`, 'utf-8');
  process.stdout.write(`[aggregate-telemetry] metrics written (session: ${sessionId})\n`);
}

try { run(); } catch (e) { process.stderr.write(`[aggregate-telemetry] ${e.message}\n`); }
