const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const SCRIPT  = path.join(root, 'tools/audit/token-session-record.js');
const SSTATE  = path.join(root, '.claude/runtime/session-state.json');
const TSTATE  = path.join(root, '.claude/audit/trigger-state.json');
const HISTORY = path.join(root, '.claude/audit/metrics/history.jsonl');
const ROLLING = path.join(root, '.claude/audit/metrics/rolling-30.json');
const FILES = [SSTATE, TSTATE, HISTORY, ROLLING];

function backup() {
  const snap = FILES.map(f => [f, fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : null]);
  return () => snap.forEach(([f, v]) => {
    if (v === null) { try { fs.unlinkSync(f); } catch {} }
    else fs.writeFileSync(f, v, 'utf-8');
  });
}

function run(extra = []) {
  const r = cp.spawnSync(process.execPath, [SCRIPT, ...extra], { encoding: 'utf-8' });
  return { status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
const setS = (agents, tokens) => fs.writeFileSync(SSTATE, JSON.stringify({
  session_id: '', task: 't', intents: [], risk: 'LOW', confidence: 'HIGH', routing: 'direct', status: 'done',
  agent_outputs: Object.fromEntries(agents.map(a => [a, { summary: '', artifacts: [], handoff_notes: '' }])),
  observations: agents.map((a, i) => ({ agent: a, outcome: i === 0 ? 'success' : 'failed', context_tokens: Math.round(tokens / agents.length) })),
}));
const setT = (key) => fs.writeFileSync(TSTATE, JSON.stringify({ session_key: key }));
const setHist = (rows) => fs.writeFileSync(HISTORY, rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
const setRolling = (o) => fs.writeFileSync(ROLLING, JSON.stringify(o));
const hist = () => fs.readFileSync(HISTORY, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const rolling = () => JSON.parse(fs.readFileSync(ROLLING, 'utf-8'));

test('records a non-trivial session and updates rolling', () => {
  const restore = backup();
  try {
    setHist([]); setRolling({ sessions_skipped: 0 }); setS(['a', 'b'], 1000); setT('K1');
    const r = run();
    assert.strictEqual(r.status, 0, r.err);
    assert.match(r.out, /"status":"recorded"/);
    assert.strictEqual(hist().length, 1);
    assert.strictEqual(hist()[0].T_total, 1000);
    assert.strictEqual(rolling().sessions_count, 1);
  } finally { restore(); }
});

test('is idempotent on repeated session_key', () => {
  const restore = backup();
  try {
    setHist([{ session_key: 'K1', T_total: 1000 }]); setRolling({ sessions_skipped: 0 });
    setS(['a', 'b'], 1000); setT('K1');
    const r = run();
    assert.match(r.out, /"status":"idempotent-skip"/);
    assert.strictEqual(hist().length, 1);
  } finally { restore(); }
});

test('skips trivial session (no agent_outputs) and counts it', () => {
  const restore = backup();
  try {
    setHist([{ session_key: 'x', T_total: 900 }]); setRolling({ sessions_skipped: 0 });
    setS([], 0); setT('K2');
    const r = run();
    assert.match(r.out, /"status":"trivial-skip"/);
    assert.strictEqual(hist().length, 1);
    assert.strictEqual(rolling().sessions_skipped, 1);
  } finally { restore(); }
});

test('reports inline-session when no agents but trigger-state shows activity', () => {
  const restore = backup();
  try {
    setHist([]); setRolling({ sessions_skipped: 0 });
    setS([], 0); // нет agent_outputs — но inline-работа была
    fs.writeFileSync(TSTATE, JSON.stringify({
      session_key: 'K-INLINE', total_calls: 42, turn_index: 9,
      read_counts: { 'a.md:0': 3, 'b.md:0': 1 },
      pending_audit: [{ trigger: 'T-07', reason: 'burst' }, { trigger: 'T-07', reason: 'burst2' }],
    }));
    const r = run();
    assert.strictEqual(r.status, 0, r.err);
    assert.match(r.out, /"status":"inline-session"/);
    assert.match(r.out, /"scope":"out-of-token-attribution"/);
    const out = JSON.parse(r.out);
    assert.strictEqual(out.signals.tool_calls, 42);
    assert.deepStrictEqual(out.signals.triggers_fired, ['T-07']); // dedup
    assert.strictEqual(out.signals.dup_reads.length, 1);          // только count>=2
    assert.strictEqual(out.signals.dup_reads[0].key, 'a.md:0');
    assert.strictEqual(hist().length, 0);            // строку в history НЕ пишем
    assert.strictEqual(rolling().sessions_inline, 1);
    assert.strictEqual(rolling().sessions_skipped, 0); // НЕ считается skipped
  } finally { restore(); }
});

test('inline session with empty trigger-state stays trivial-skip', () => {
  const restore = backup();
  try {
    setHist([]); setRolling({ sessions_skipped: 0 });
    setS([], 0); setT('K-EMPTY'); // trigger-state без активности
    const r = run();
    assert.match(r.out, /"status":"trivial-skip"/);
    assert.strictEqual(rolling().sessions_skipped, 1);
  } finally { restore(); }
});

test('skips trivial session below MIN_TOKENS', () => {
  const restore = backup();
  try {
    setHist([]); setRolling({ sessions_skipped: 3 }); setS(['a'], 100); setT('K3');
    const r = run();
    assert.match(r.out, /"status":"trivial-skip"/);
    assert.strictEqual(rolling().sessions_skipped, 4);
  } finally { restore(); }
});

test('passes estimated fields through to the row', () => {
  const restore = backup();
  try {
    setHist([]); setRolling({ sessions_skipped: 0 }); setS(['a', 'b'], 2000); setT('K4');
    const r = run(['--estimates', '{"T_useful":1200,"IDC":0.6,"R_dup":0.05,"E_resp":0.7}']);
    const row = hist()[0];
    assert.strictEqual(row.IDC, 0.6);
    assert.strictEqual(row.estimated_fields_present, true);
    assert.strictEqual(rolling().aggregates.IDC_mean, 0.6);
  } finally { restore(); }
});

test('dry-run writes nothing', () => {
  const restore = backup();
  try {
    setHist([{ session_key: 'a', T_total: 100 }]); setRolling({ sessions_skipped: 0 });
    const before = fs.readFileSync(HISTORY, 'utf-8');
    setS(['a', 'b'], 3000); setT('K5');
    const r = run(['--dry-run']);
    assert.match(r.out, /"status": "dry-run"/);
    assert.strictEqual(fs.readFileSync(HISTORY, 'utf-8'), before);
  } finally { restore(); }
});

test('recomputes rolling mean over the window', () => {
  const restore = backup();
  try {
    setHist([{ session_key: 'a', T_total: 100 }, { session_key: 'b', T_total: 200 }, { session_key: 'c', T_total: 300 }]);
    setRolling({ sessions_skipped: 0 }); setS(['a', 'b'], 800); setT('K6');
    run();
    assert.strictEqual(rolling().sessions_count, 4);
    assert.strictEqual(rolling().aggregates.T_total_mean, 350); // (100+200+300+800)/4
  } finally { restore(); }
});

test('skips corrupt NDJSON lines without aborting', () => {
  const restore = backup();
  try {
    fs.writeFileSync(HISTORY, '{"session_key":"x","T_total":50}\nNOT JSON\n{"session_key":"y","T_total":150}\n');
    setRolling({ sessions_skipped: 0 }); setS(['a'], 600); setT('K7');
    const r = run();
    assert.match(r.out, /"status":"recorded"/);
    assert.strictEqual(hist().length, 3); // 2 valid + 1 new (corrupt dropped)
  } finally { restore(); }
});

test('exits non-zero when session-state is missing', () => {
  const restore = backup();
  try {
    try { fs.unlinkSync(SSTATE); } catch {}
    const r = run();
    assert.strictEqual(r.status, 1);
  } finally { restore(); }
});
