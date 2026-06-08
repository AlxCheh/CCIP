#!/usr/bin/env node
'use strict';
// RFC R9 — Runtime Governance Score (advisory). Deterministic governance sub-metrics
// from the manifest: EC (enforcement coverage) + TI (trigger integrity). When runtime
// data is available (state + events), also computes CCR and FC for a fuller score.
// Always exit 0; hard-fail on threshold is a separate Breaking Change.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { gitRoot } = require('./_lib/git-root');
const root = gitRoot();

function computeEC(manifest) {
  const inv = manifest.invariants || [];
  if (inv.length === 0) return 1;
  const enforced = inv.filter(i => i.kind === 'block' || i.kind === 'signal').length;
  return Number((enforced / inv.length).toFixed(2));
}

/** CCR = 1 - missing/total. Returns null if no observations (skip). */
function computeCCR(observations) {
  if (!observations || observations.length === 0) return null;
  const missing = observations.filter(o => o && o.missing_state_update === true).length;
  return Number((1 - missing / observations.length).toFixed(2));
}

/**
 * FC = 1 if events exist for a session that had activity, 0 if no events but had activity.
 * Returns null if session was idle (no observations and no events).
 */
function computeFC(events, observations) {
  const hasActivity = (observations && observations.length > 0);
  if (!hasActivity && (!events || events.length === 0)) return null; // idle
  return events && events.length > 0 ? 1 : 0;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(root, '.claude/runtime/governance-manifest.json'), 'utf-8'));
  const ec = computeEC(manifest);
  const ti = cp.spawnSync(process.execPath, [path.join(root, 'tools/audit/trigger-integrity.js')],
    { cwd: root }).status === 0 ? 1 : 0;

  // Attempt to read runtime data (state + events) if available.
  const stateFile = process.env.CCIP_STATE_FILE
    || path.join(root, '.claude/runtime/session-state.json');
  const eventsFile = process.env.CCIP_EVENTS_FILE
    || path.join(root, '.claude/runtime/events.jsonl');

  let observations = null;
  let events = null;
  try { observations = JSON.parse(fs.readFileSync(stateFile, 'utf-8')).observations || []; } catch {}
  try {
    events = fs.readFileSync(eventsFile, 'utf-8').trim().split('\n')
      .filter(Boolean).map(JSON.parse);
  } catch {}

  const ccr = (observations !== null) ? computeCCR(observations) : null;
  const fc  = (observations !== null && events !== null) ? computeFC(events, observations) : null;

  if (ccr !== null && fc !== null) {
    // Partial full score: EC(0.30) + CCR(0.25) + FC(0.20) + TI(0.15), RC omitted (no history store)
    // Normalize to available weights: 0.30+0.25+0.20+0.15 = 0.90
    const rgs = Number(((ec * 0.30 + ccr * 0.25 + fc * 0.20 + ti * 0.15) / 0.90).toFixed(2));
    console.log(`[RGS] governance-full=${rgs} (EC=${ec} CCR=${ccr} FC=${fc} TI=${ti}) — advisory`);
  } else {
    const rgs = Number(((ec + ti) / 2).toFixed(2));
    console.log(`[RGS] governance-static=${rgs} (EC=${ec} TI=${ti}) — advisory`);
  }
  process.exit(0);
}

if (require.main === module) {
  try { main(); } catch (e) { process.stderr.write(`[RGS] ${e.message}\n`); process.exit(0); }
}
module.exports = { computeEC, computeCCR, computeFC };
