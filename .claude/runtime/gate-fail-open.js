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

  // Best-effort state alert so governance-reactor surfaces it next turn.
  try {
    const fresh = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    const alert = { kind: 'gate_failed_open', at, gate, phase, message: msg, session: fresh.session_id || '' };
    const merged = [...(Array.isArray(fresh.governance_alerts) ? fresh.governance_alerts : []), alert];
    const tmp = stateFile + '.gfo.tmp.' + process.pid;
    const fd = fs.openSync(tmp, 'w');
    try { fs.writeSync(fd, JSON.stringify({ ...fresh, governance_alerts: merged }, null, 2)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    try { fs.renameSync(tmp, stateFile); }
    catch (e) { try { fs.unlinkSync(tmp); } catch {} }
  } catch { /* never throw — durable log already captured it */ }
}

module.exports = { recordGateFailOpen };
