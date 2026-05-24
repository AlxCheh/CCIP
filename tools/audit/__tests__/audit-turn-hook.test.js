const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const HOOK   = path.join(root, '.claude/runtime/audit-turn-hook.js');
const TSTATE = path.join(root, '.claude/audit/trigger-state.json');

const BASE_STATE = {
  session_id: '', session_key: 'test-key', total_calls: 0,
  turn_index: 0, tool_calls_this_turn: 5, read_counts: {},
  agent_failures_window: [], audit_in_progress: false,
  pending_audit: [], cooldowns: {},
};

function backup() {
  const orig = fs.existsSync(TSTATE) ? fs.readFileSync(TSTATE, 'utf-8') : null;
  return () => {
    if (orig === null) { try { fs.unlinkSync(TSTATE); } catch {} }
    else fs.writeFileSync(TSTATE, orig, 'utf-8');
  };
}

function runHook(stateOverride, stdinPayload) {
  fs.writeFileSync(TSTATE, JSON.stringify(stateOverride, null, 2) + '\n', 'utf-8');
  const input = typeof stdinPayload === 'string' ? stdinPayload
    : JSON.stringify(stdinPayload || {});
  const r = cp.spawnSync(process.execPath, [HOOK], { input, encoding: 'utf-8' });
  const state = JSON.parse(fs.readFileSync(TSTATE, 'utf-8'));
  return { status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), state };
}

test('normal turn: increments turn_index, resets tool_calls, no T-02 nudge', () => {
  const restore = backup();
  try {
    const r = runHook({ ...BASE_STATE }, { prompt: 'Делаем что-то обычное' });
    assert.strictEqual(r.status, 0, r.err);
    assert.strictEqual(r.state.turn_index, 1, 'turn_index must increment');
    assert.strictEqual(r.state.tool_calls_this_turn, 0, 'tool_calls reset');
    assert.strictEqual(r.state.pending_audit.find(p => p.trigger === 'T-02'), undefined);
    assert.strictEqual(r.out, '', 'no nudge for normal phrase');
  } finally { restore(); }
});

test('"Завершаем сессию" → T-02 in pending_audit + nudge with ccip-session-optimizer', () => {
  const restore = backup();
  try {
    const r = runHook({ ...BASE_STATE }, { prompt: 'Завершаем сессию' });
    assert.strictEqual(r.status, 0, r.err);
    const t02 = r.state.pending_audit.find(p => p.trigger === 'T-02');
    assert.ok(t02, 'T-02 must be in pending_audit');
    assert.match(t02.reason, /session-end phrase/);
    assert.match(r.out, /ccip-session-optimizer/);
    assert.match(r.out, /token-efficiency-auditor/);
    assert.match(r.out, /T-02/);
  } finally { restore(); }
});

test('"Закрываем сессию" → T-02', () => {
  const restore = backup();
  try {
    const r = runHook({ ...BASE_STATE }, { prompt: 'Закрываем сессию' });
    assert.strictEqual(r.status, 0, r.err);
    assert.ok(r.state.pending_audit.find(p => p.trigger === 'T-02'));
  } finally { restore(); }
});

test('"End session" (English) → T-02', () => {
  const restore = backup();
  try {
    const r = runHook({ ...BASE_STATE }, { prompt: 'End session' });
    assert.strictEqual(r.status, 0, r.err);
    assert.ok(r.state.pending_audit.find(p => p.trigger === 'T-02'));
  } finally { restore(); }
});

test('"/session-end" slash command → T-02', () => {
  const restore = backup();
  try {
    const r = runHook({ ...BASE_STATE }, { prompt: '/session-end' });
    assert.strictEqual(r.status, 0, r.err);
    assert.ok(r.state.pending_audit.find(p => p.trigger === 'T-02'));
  } finally { restore(); }
});

test('case-insensitive: "ЗАВЕРШАЕМ СЕССИЮ" → T-02', () => {
  const restore = backup();
  try {
    const r = runHook({ ...BASE_STATE }, { prompt: 'ЗАВЕРШАЕМ СЕССИЮ' });
    assert.strictEqual(r.status, 0, r.err);
    assert.ok(r.state.pending_audit.find(p => p.trigger === 'T-02'));
  } finally { restore(); }
});

test('case-insensitive: "END SESSION" → T-02', () => {
  const restore = backup();
  try {
    const r = runHook({ ...BASE_STATE }, { prompt: 'END SESSION' });
    assert.strictEqual(r.status, 0, r.err);
    assert.ok(r.state.pending_audit.find(p => p.trigger === 'T-02'));
  } finally { restore(); }
});

test('T-09 on turn 20: only T-09, no T-02', () => {
  const restore = backup();
  try {
    const r = runHook({ ...BASE_STATE, turn_index: 19 }, { prompt: 'нормальный промпт' });
    assert.strictEqual(r.status, 0, r.err);
    assert.ok(r.state.pending_audit.find(p => p.trigger === 'T-09'), 'T-09 must fire');
    assert.strictEqual(r.state.pending_audit.find(p => p.trigger === 'T-02'), undefined, 'no T-02');
    assert.match(r.out, /T-09/);
    assert.doesNotMatch(r.out, /T-02/);
  } finally { restore(); }
});

test('T-02 + T-09 simultaneous: turn 20 + "Завершаем сессию" → both fire', () => {
  const restore = backup();
  try {
    const r = runHook({ ...BASE_STATE, turn_index: 19 }, { prompt: 'Завершаем сессию' });
    assert.strictEqual(r.status, 0, r.err);
    assert.ok(r.state.pending_audit.find(p => p.trigger === 'T-02'), 'T-02 must fire');
    assert.ok(r.state.pending_audit.find(p => p.trigger === 'T-09'), 'T-09 must fire');
    assert.match(r.out, /T-02/);
    assert.match(r.out, /T-09/);
    assert.match(r.out, /ccip-session-optimizer/);
  } finally { restore(); }
});
