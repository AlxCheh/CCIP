'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();
const DETECTORS = path.join(root, '.claude/runtime/failure-detectors.js');

test('failure-detectors runs on Stop AFTER aggregate-telemetry and BEFORE flush-state', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf-8'));
  const cmds = settings.hooks.Stop.flatMap(b => b.hooks.map(h => h.command));
  const aggIdx  = cmds.findIndex(c => /aggregate-telemetry\.js/.test(c));
  const detIdx  = cmds.findIndex(c => /failure-detectors\.js/.test(c));
  const flushIdx = cmds.findIndex(c => /flush-state\.js/.test(c));
  assert.ok(detIdx >= 0, 'failure-detectors must be a Stop hook');
  assert.ok(aggIdx < detIdx, 'failure-detectors must run after aggregate-telemetry');
  assert.ok(detIdx < flushIdx, 'failure-detectors must run before flush-state');
});

test('manifest declares INV-FAILURE-DETECTOR', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, '.claude/runtime/governance-manifest.json'), 'utf-8'));
  assert.ok(m.invariants.some(i => i.id === 'INV-FAILURE-DETECTOR'), 'manifest must declare INV-FAILURE-DETECTOR');
});

// ── #2 Wave2: INV-TOOL-TELEMETRY end-to-end enforcement ──────────────────────

test('#2 telemetry-blackout: failure-detectors wires to governance_alerts in state', () => {
  const stateFile = path.join(os.tmpdir(), `ccip-fd-wiring-${Date.now()}.json`);
  const eventsFile = path.join(os.tmpdir(), `ccip-fd-events-${Date.now()}.jsonl`);
  const state = {
    session_id: 'test-blackout-01',
    observations: [{ agent: 'ccip-architect', missing_state_update: false }],
    governance_alerts: [],
    agent_outputs: {},
    contract_debt: 0,
    dag: [],
  };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
  // eventsFile deliberately absent → telemetry blackout

  const res = cp.spawnSync(process.execPath, [DETECTORS], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      CCIP_STATE_FILE: stateFile,
      CCIP_EVENTS_FILE: eventsFile,
    },
  });

  assert.strictEqual(res.status, 0, `detectors must exit 0 (fail-open). stderr: ${res.stderr.slice(0, 200)}`);
  const updated = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  assert.ok(Array.isArray(updated.governance_alerts) && updated.governance_alerts.length > 0,
    'governance_alerts must be non-empty after blackout detection');
  assert.ok(updated.governance_alerts.some(a => a.kind === 'telemetry_blackout'),
    'must include a telemetry_blackout alert');

  fs.rmSync(stateFile, { force: true });
  fs.rmSync(eventsFile, { force: true });
});
