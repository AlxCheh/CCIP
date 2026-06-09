#!/usr/bin/env node
'use strict';
/**
 * Stop hook (RFC R6) — runs detectors over session state + events, appends to
 * governance_alerts[]. MUST run AFTER aggregate-telemetry, BEFORE flush-state.
 * Fail-open: any error → exit 0 + stderr.
 *
 * [INV-FAILURE-DETECTOR] RFC R6 — structured failure signals in governance_alerts
 */

// ── pure detectors ─────────────────────────────────────────────────────────────

function detectSSC(observations) {
  if (!observations || observations.length === 0) return null;
  const missing = observations.filter(o => o && o.missing_state_update === true).length;
  const ssc = Number(((observations.length - missing) / observations.length).toFixed(2));
  if (ssc < 0.8) return { kind: 'silent_state_degradation', ssc, threshold: 0.8 };
  return null;
}

function detectTelemetryBlackout(observations, events) {
  if (!observations || observations.length === 0) return null; // idle session — not a blackout
  if ((events || []).length === 0) return { kind: 'telemetry_blackout', agents: observations.length };
  return null;
}

function detectHandoffDecay(agentOutputs) {
  const outputs = Object.values(agentOutputs || {});
  if (outputs.length === 0) return null;
  const empty = outputs.filter(o => !o.handoff_notes || String(o.handoff_notes).trim() === '').length;
  const ratio = Number((empty / outputs.length).toFixed(2));
  if (ratio > 0.4) return { kind: 'handoff_decay', ratio, threshold: 0.4 };
  return null;
}

function detectContractCollapse(state, threshold) {
  const debt = state.contract_debt || 0;
  if (debt >= threshold) return { kind: 'contract_collapse', debt, threshold };
  return null;
}

function detectFallbackDegradation(state) {
  const dag = state.dag || [];
  const bad = dag.filter(s => s.agent === 'general-purpose' && !s.fallback_for);
  if (bad.length > 0) return { kind: 'fallback_degradation', steps: bad.map(s => s.step) };
  return null;
}

function runDetectors(state, events, opts = {}) {
  const threshold = opts.contractDebtThreshold
    || parseInt(process.env.CCIP_CONTRACT_DEBT_THRESHOLD || '3', 10);
  const obs = state.observations || [];
  const results = [
    detectSSC(obs),
    detectTelemetryBlackout(obs, events),
    detectHandoffDecay(state.agent_outputs),
    detectContractCollapse(state, threshold),
    detectFallbackDegradation(state),
  ].filter(Boolean);
  return results.map(a => ({ ...a, at: new Date().toISOString(), session: state.session_id }));
}

module.exports = {
  detectSSC, detectTelemetryBlackout, detectHandoffDecay,
  detectContractCollapse, detectFallbackDegradation, runDetectors,
};

// ── main (Stop hook entrypoint) ────────────────────────────────────────────────
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.resolve(__dirname, '../..');
  const STATE_FILE = process.env.CCIP_STATE_FILE
    || path.join(ROOT, '.claude/runtime/session-state.json');
  const EVENTS_FILE = process.env.CCIP_EVENTS_FILE
    || path.join(ROOT, '.claude/runtime/events.jsonl');

  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    let events = [];
    try {
      events = fs.readFileSync(EVENTS_FILE, 'utf-8').trim().split('\n')
        .filter(Boolean).map(JSON.parse);
    } catch {}

    const alerts = runDetectors(state, events);
    if (alerts.length === 0) { process.exit(0); }

    for (const a of alerts)
      process.stderr.write(`[failure-detectors] ALERT ${a.kind}: ${JSON.stringify(a)}\n`);

    // Re-read state immediately before write to capture any concurrent flush (HA-3)
    let freshState;
    try { freshState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); }
    catch { freshState = state; }

    const existing = freshState.governance_alerts || [];
    const merged = [...existing, ...alerts];

    const tmp = STATE_FILE + '.fd.tmp.' + process.pid;
    const data = JSON.stringify({ ...freshState, governance_alerts: merged }, null, 2);
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    try {
      fs.renameSync(tmp, STATE_FILE);
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch {}
      throw e;
    }
  } catch (e) {
    process.stderr.write(`[failure-detectors] ${e.message}\n`); // fail-open
  }
  process.exit(0);
}
