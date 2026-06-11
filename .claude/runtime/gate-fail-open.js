'use strict';
/**
 * gate-fail-open.js (E-6) — make a DENY-capable gate's fail-open OBSERVABLE.
 *
 * pre-agent-gate and read-gate catch any error and exit 0 (allow) so governance never
 * breaks the session. That default is correct — the payload envelope is harness-controlled,
 * not an attacker surface, and blanket fail-closed would let one bug kill every spawn/read.
 * The residual risk was BLINDNESS: a clean allow and an errored allow looked identical.
 *
 * This records each fail-open as a durable governance-audit.jsonl line (robust channel) AND
 * a state governance_alert (best-effort — surfaced next turn by governance-reactor, G-1).
 * The recorder itself NEVER throws (would defeat fail-open).
 *
 * `phase`: 'parse' = the harness payload could not be parsed (low concern, infra/version);
 *          'evaluate' = parsed fine but the gate logic threw (a real bug — higher concern).
 */
const fs = require('fs');
const path = require('path');
const { updateStateLocked } = require('./state-io'); // HA-2: locked alert-append

const ROOT = path.resolve(__dirname, '../..');
const MAX_BYTES = 5 * 1024 * 1024;

function recordGateFailOpen({ gate, phase, message }) {
  const stateFile = process.env.CCIP_STATE_FILE || path.join(ROOT, '.claude/runtime/session-state.json');
  const auditFile = process.env.CCIP_GOV_AUDIT_FILE || path.join(ROOT, '.claude/runtime/governance-audit.jsonl');
  const at = new Date().toISOString();
  const msg = String(message == null ? '' : message).slice(0, 200);

  // Durable append-only log — robust even when session-state is unreadable.
  try {
    try { if (fs.statSync(auditFile).size > MAX_BYTES) fs.renameSync(auditFile, auditFile + '.1'); } catch {}
    fs.appendFileSync(auditFile, JSON.stringify({ kind: 'gate_failed_open', at, gate, phase, message: msg }) + '\n', 'utf-8');
  } catch { /* never throw */ }

  // Best-effort state alert so governance-reactor surfaces it next turn (HA-2: locked append).
  try {
    updateStateLocked(stateFile, (fresh) => {
      const alert = { kind: 'gate_failed_open', at, gate, phase, message: msg, session: fresh.session_id || '' };
      (fresh.governance_alerts ||= []).push(alert);
    });
  } catch { /* never throw — durable log already captured it */ }
}

/**
 * recordStateLockFailOpen (HA-2) — make a state-lock acquire-timeout OBSERVABLE.
 * When updateStateLocked cannot grab the lock within the timeout, the write proceeds
 * WITHOUT mutual exclusion (never deadlock a hook). That residual race must be visible —
 * reuse the same durable-log + reactor-surfaced channel as gate fail-open (E-6 pattern).
 */
function recordStateLockFailOpen({ gate, why }) {
  recordGateFailOpen({ gate: `state-lock/${gate}`, phase: 'lock', message: `lock fail-open: ${why}` });
}

module.exports = { recordGateFailOpen, recordStateLockFailOpen };
