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
const SID = '2026-01-01-1200';

// M-1: isolate to a tmp state file (CCIP_STATE_FILE) — no shared session-state.json races.
function mkState(observations) {
  const p = path.join(os.tmpdir(), `agg-state-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(p, JSON.stringify({
    session_id: SID, task: 'metrics-test', intents: [], risk: 'LOW',
    confidence: 'HIGH', routing: 'planner', dag: [], current_step: 0, agent_outputs: {},
    status: 'done', started_at: '', observations,
  }), 'utf-8');
  return p;
}
function obs(agent, missing) {
  return { agent, session: SID, written_at: '2026-01-01T12:00:00.000Z',
    dag_step: 1, outcome: 'success', context_tokens: 100, reason: '', missing_state_update: missing };
}
// Event helper — session defaults to the current session (SID).
function ev(extra = {}) {
  return JSON.stringify({ ts: 't', session: SID, tool: 'Read', target: 'a', bytes: 1, full_read: false, outcome: 'ok', ...extra });
}
function runHook(stateFile, eventsFile, feedbackFile) {
  return cp.spawnSync(process.execPath, [HOOK], { encoding: 'utf-8',
    env: { ...process.env, CCIP_STATE_FILE: stateFile, CCIP_EVENTS_FILE: eventsFile, CCIP_FEEDBACK_FILE: feedbackFile } });
}

test('aggregate writes a §5 metrics line with tool + contract counts', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-agg-'));
  const feedback = path.join(tmp, 'feedback-loop.md');
  const events = path.join(tmp, 'events.jsonl');
  const sf = mkState([obs('ccip-architect', true), obs('ccip-dba', false)]);
  fs.writeFileSync(events, ev({ tool: 'Read', full_read: true }) + '\n' + ev({ tool: 'Bash', target: 'ls' }) + '\n', 'utf-8');
  try {
    runHook(sf, events, feedback);
    const md = fs.readFileSync(feedback, 'utf-8');
    assert.match(md, /## 5\. Session Metrics/);
    assert.match(md, /tool_calls=2/);
    assert.match(md, /full_reads=1/);
    assert.match(md, /agents=2/);
    assert.match(md, /SSC=0\.5/);
    assert.match(md, /inline=true/);
  } finally {
    fs.rmSync(sf, { force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('aggregate is idempotent on repeated run', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-agg2-'));
  const feedback = path.join(tmp, 'feedback-loop.md');
  const events = path.join(tmp, 'events.jsonl');
  const sf = mkState([obs('ccip-architect', false)]);
  fs.writeFileSync(events, ev() + '\n', 'utf-8');
  try {
    runHook(sf, events, feedback);
    runHook(sf, events, feedback);
    const md = fs.readFileSync(feedback, 'utf-8');
    const occurrences = (md.match(/tool_calls=1/g) || []).length;
    assert.strictEqual(occurrences, 1, 'metrics line must be written once');
  } finally {
    fs.rmSync(sf, { force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('T-1/UU-3: events from other sessions are excluded from this session metrics', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-agg-uu3-'));
  const feedback = path.join(tmp, 'feedback-loop.md');
  const events = path.join(tmp, 'events.jsonl');
  const sf = mkState([obs('ccip-architect', false)]);
  // 2 events for THIS session, 3 from a different session
  fs.writeFileSync(events, [
    ev({ tool: 'Read' }), ev({ tool: 'Bash', target: 'ls' }),
    ev({ session: 'other-session', tool: 'Read' }),
    ev({ session: 'other-session', tool: 'Bash' }),
    ev({ session: 'other-session', tool: 'Write' }),
  ].join('\n') + '\n', 'utf-8');
  try {
    runHook(sf, events, feedback);
    const md = fs.readFileSync(feedback, 'utf-8');
    assert.match(md, /tool_calls=2\b/, 'only this session\'s 2 events counted, not all 5');
  } finally {
    fs.rmSync(sf, { force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('aggregate sums est_tokens for THIS session into the §5 line', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-agg-tok-'));
  const feedback = path.join(tmp, 'feedback-loop.md');
  const events = path.join(tmp, 'events.jsonl');
  const sf = mkState([obs('ccip-architect', false)]);
  // two THIS-session events (est_tokens 100 + 250) + one other-session (ignored)
  fs.writeFileSync(events, [
    ev({ tool: 'Read', est_tokens: 100 }),
    ev({ tool: 'Bash', target: 'ls', est_tokens: 250 }),
    ev({ session: 'other-session', tool: 'Read', est_tokens: 9999 }),
  ].join('\n') + '\n', 'utf-8');
  try {
    runHook(sf, events, feedback);
    const md = fs.readFileSync(feedback, 'utf-8');
    assert.match(md, /est_tokens=350\b/, 'only this session est_tokens summed (100+250)');
  } finally {
    fs.rmSync(sf, { force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('T-1: filter is skipped when session_id is uninitialised (graceful degrade)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-agg-deg-'));
  const feedback = path.join(tmp, 'feedback-loop.md');
  const events = path.join(tmp, 'events.jsonl');
  // state with empty session_id → sessionId='unknown' → no filter → all events counted
  const p = path.join(os.tmpdir(), `agg-state-deg-${Date.now()}.json`);
  fs.writeFileSync(p, JSON.stringify({
    session_id: '', task: 't', intents: [], risk: 'LOW', confidence: 'HIGH', routing: 'planner',
    dag: [], current_step: 0, agent_outputs: {}, status: 'done', started_at: '',
    observations: [obs('ccip-architect', false)],
  }), 'utf-8');
  fs.writeFileSync(events, ev({ session: 'a' }) + '\n' + ev({ session: 'b' }) + '\n', 'utf-8');
  try {
    runHook(p, events, feedback);
    const md = fs.readFileSync(feedback, 'utf-8');
    assert.match(md, /tool_calls=2\b/, 'no filter when session_id unknown — both events counted');
  } finally {
    fs.rmSync(p, { force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
