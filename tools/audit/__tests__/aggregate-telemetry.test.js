'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const HOOK = path.join(root, '.claude/runtime/aggregate-telemetry.js');
const STATE = path.join(root, '.claude/runtime/session-state.json');

function backupState() {
  const original = fs.readFileSync(STATE, 'utf-8');
  return () => fs.writeFileSync(STATE, original, 'utf-8');
}

function baseState(observations) {
  return { session_id: '2026-01-01-1200', task: 'metrics-test', intents: [], risk: 'LOW',
    confidence: 'HIGH', routing: 'planner', dag: [], current_step: 0, agent_outputs: {},
    status: 'done', started_at: '', observations };
}

function obs(agent, missing) {
  return { agent, session: '2026-01-01-1200', written_at: '2026-01-01T12:00:00.000Z',
    dag_step: 1, outcome: 'success', context_tokens: 100, reason: '', missing_state_update: missing };
}

test('aggregate writes a §5 metrics line with tool + contract counts', () => {
  const restore = backupState();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-agg-'));
  const feedback = path.join(tmp, 'feedback-loop.md');
  const events = path.join(tmp, 'events.jsonl');
  fs.writeFileSync(events,
    JSON.stringify({ ts: 't', session: 's', tool: 'Read', target: 'a', bytes: 1, full_read: true, outcome: 'ok' }) + '\n' +
    JSON.stringify({ ts: 't', session: 's', tool: 'Bash', target: 'ls', bytes: 1, full_read: false, outcome: 'ok' }) + '\n', 'utf-8');
  try {
    fs.writeFileSync(STATE, JSON.stringify(baseState([obs('ccip-architect', true), obs('ccip-dba', false)])), 'utf-8');
    cp.spawnSync(process.execPath, [HOOK], { encoding: 'utf-8',
      env: { ...process.env, CCIP_FEEDBACK_FILE: feedback, CCIP_EVENTS_FILE: events } });
    const md = fs.readFileSync(feedback, 'utf-8');
    assert.match(md, /## 5\. Session Metrics/);
    assert.match(md, /tool_calls=2/);
    assert.match(md, /full_reads=1/);
    assert.match(md, /agents=2/);
    assert.match(md, /SSC=0\.5/);     // 1 of 2 agents missed the block
    assert.match(md, /inline=true/);  // had tool events
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('aggregate is idempotent on repeated run', () => {
  const restore = backupState();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-agg2-'));
  const feedback = path.join(tmp, 'feedback-loop.md');
  const events = path.join(tmp, 'events.jsonl');
  fs.writeFileSync(events, JSON.stringify({ ts: 't', session: 's', tool: 'Read', target: 'a', bytes: 1, full_read: false, outcome: 'ok' }) + '\n', 'utf-8');
  try {
    fs.writeFileSync(STATE, JSON.stringify(baseState([obs('ccip-architect', false)])), 'utf-8');
    const env = { ...process.env, CCIP_FEEDBACK_FILE: feedback, CCIP_EVENTS_FILE: events };
    cp.spawnSync(process.execPath, [HOOK], { encoding: 'utf-8', env });
    cp.spawnSync(process.execPath, [HOOK], { encoding: 'utf-8', env });
    const md = fs.readFileSync(feedback, 'utf-8');
    const occurrences = (md.match(/tool_calls=1/g) || []).length;
    assert.strictEqual(occurrences, 1, 'metrics line must be written once');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
