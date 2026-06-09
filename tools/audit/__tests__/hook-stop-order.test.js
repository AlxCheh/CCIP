'use strict';
/**
 * Tests for Stop hook order safety (HA-3):
 * failure-detectors re-reads state before writing so it picks up
 * whatever flush-state wrote, regardless of which Stop hook ran first.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const ROOT = gitRoot();
const DETECTORS = path.join(ROOT, '.claude/runtime/failure-detectors.js');
const FLUSH = path.join(ROOT, '.claude/runtime/flush-state.js');

function tmpState(obj) {
  const f = path.join(os.tmpdir(), `fd-order-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(f, JSON.stringify(obj, null, 2));
  return f;
}

function runHook(script, stateFile, feedbackFile) {
  const env = {
    ...process.env,
    CCIP_STATE_FILE: stateFile,
    CCIP_FEEDBACK_FILE: feedbackFile || stateFile + '.fb',
  };
  execFileSync(process.execPath, [script], { env, input: '', stdio: ['pipe', 'ignore', 'ignore'] });
}

test('flush-first order: failure-detectors picks up flushed (cleared) state before writing alerts', () => {
  // Session with 2 observations — one missing state update → SSC = 0.5 < 0.8 → triggers alert
  const initial = {
    session_id: 'order-test-1',
    status: 'complete',
    observations: [
      { agent: 'agent-a', missing_state_update: false },
      { agent: 'agent-b', missing_state_update: true },
    ],
    agent_outputs: {},
    dag: [],
    governance_alerts: [],
    contract_debt: 0,
  };
  const stateFile = tmpState(initial);
  const feedbackFile = stateFile + '.feedback.md';
  try {
    // Step 1: flush-state runs first — clears observations
    runHook(FLUSH, stateFile, feedbackFile);
    const afterFlush = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    assert.deepStrictEqual(afterFlush.observations, [], 'flush must clear observations');

    // Step 2: failure-detectors runs after flush — re-reads fresh state (no observations now)
    // With no observations, SSC detector returns null → no alerts should be added
    runHook(DETECTORS, stateFile);
    const afterDetectors = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));

    // Detectors ran on flushed state (0 observations) → no SSC alert
    const sscAlerts = (afterDetectors.governance_alerts || []).filter(a => a.kind === 'silent_state_degradation');
    assert.strictEqual(sscAlerts.length, 0, 'no SSC alert when observations already flushed');
  } finally {
    try { fs.unlinkSync(stateFile); } catch {}
    try { fs.unlinkSync(feedbackFile); } catch {}
  }
});

test('detectors-first order: alerts written by failure-detectors survive subsequent flush', () => {
  // Session with 2 observations — one missing → SSC alert expected
  const initial = {
    session_id: 'order-test-2',
    status: 'complete',
    observations: [
      { agent: 'agent-x', missing_state_update: false },
      { agent: 'agent-y', missing_state_update: true },
    ],
    agent_outputs: {},
    dag: [],
    governance_alerts: [],
    contract_debt: 0,
  };
  const stateFile = tmpState(initial);
  const feedbackFile = stateFile + '.feedback.md';
  try {
    // Step 1: failure-detectors runs first — reads live observations, writes SSC alert
    runHook(DETECTORS, stateFile);
    const afterDetectors = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    const alertsBefore = (afterDetectors.governance_alerts || []).filter(a => a.kind === 'silent_state_degradation');
    assert.ok(alertsBefore.length >= 1, 'SSC alert must be present after detectors run');

    // Step 2: flush-state runs after — must NOT erase governance_alerts
    runHook(FLUSH, stateFile, feedbackFile);
    const afterFlush = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    const alertsAfter = (afterFlush.governance_alerts || []).filter(a => a.kind === 'silent_state_degradation');
    assert.ok(alertsAfter.length >= 1, 'governance_alerts must survive flush-state');
    assert.deepStrictEqual(afterFlush.observations, [], 'observations must still be cleared by flush');
  } finally {
    try { fs.unlinkSync(stateFile); } catch {}
    try { fs.unlinkSync(feedbackFile); } catch {}
  }
});
