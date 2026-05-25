const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');
const { acquireSerialGuard } = require('../_lib/serial-guard');

// Тесты мутируют общий реальный rule-set → serial-by-design (см. serial-guard.js).
acquireSerialGuard('token-rules-apply.test.js');

const root = gitRoot();
const SCRIPT = path.join(root, 'tools/audit/token-rules-apply.js');
const RULES  = path.join(root, '.claude/audit/rules');
const ACTIVE = path.join(RULES, 'active.yaml');
const QUAR   = path.join(RULES, 'quarantine.yaml');
const DEPR   = path.join(RULES, 'deprecated.yaml');
const DELTA  = path.join(RULES, 'rules-delta.json');
const CHANGELOG = path.join(root, '.claude/audit/metrics/rules-changelog.jsonl');
const FILES = [ACTIVE, QUAR, DEPR, DELTA, CHANGELOG];

function backup() {
  const snap = FILES.map(f => [f, fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : null]);
  return () => snap.forEach(([f, v]) => {
    if (v === null) { try { fs.unlinkSync(f); } catch {} }
    else fs.writeFileSync(f, v, 'utf-8');
  });
}
function run() {
  const r = cp.spawnSync(process.execPath, [SCRIPT], { encoding: 'utf-8' });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
// fixtures keeping all 15 baseline rules partitioned across the working sets
const activeFlow = (ids) => '# active fixture\nversion: 1\nsynced_from_baseline: 2026-05-23\nactive:\n' +
  ids.map(id => `  - { id: ${id}, status: active, hit_count: 0, precision: null, sessions_observed: 0 }`).join('\n') + '\n';
const quarBlock = (entries) => '# quarantine fixture\nversion: 1\nquarantine:\n' +
  entries.map(e => `  - id: ${e.id}\n    status: quarantine\n    requires_transcript_access: ${!!e.tr}\n    sessions_in_quarantine: ${e.s || 0}\n    hit_count: 0\n    precision: ${e.p == null ? 'null' : e.p}`).join('\n\n') + '\n';
const ACTIVE_11 = ['R-002', 'R-003', 'R-004', 'R-005', 'R-006', 'R-008', 'R-010', 'R-011', 'R-013', 'R-014', 'R-015'];
const QUAR_4 = [{ id: 'R-001', s: 3, p: 0.8 }, { id: 'R-007', tr: true }, { id: 'R-009', tr: true }, { id: 'R-012', tr: true }];
const parse = (p) => require('gray-matter')('---\n' + fs.readFileSync(p, 'utf-8') + '\n---\n').data;
const ids = (list) => list.map(e => e.id);

test('promotes a quarantine rule into active and validates clean', () => {
  const restore = backup();
  try {
    fs.writeFileSync(ACTIVE, activeFlow(ACTIVE_11));
    fs.writeFileSync(QUAR, quarBlock(QUAR_4));
    fs.writeFileSync(DEPR, '# dep\nversion: 1\ndeprecated: []\n');
    fs.writeFileSync(DELTA, JSON.stringify({ status: 'proposed', promote: [{ id: 'R-001', from: 'quarantine', to: 'active', reason: 'test' }], deprecate: [] }));
    const r = run();
    assert.strictEqual(r.status, 0, r.out);
    assert.match(r.out, /"status":"applied"/);
    assert.ok(ids(parse(ACTIVE).active).includes('R-001'), 'R-001 now active');
    assert.ok(!ids(parse(QUAR).quarantine).includes('R-001'), 'R-001 left quarantine');
    assert.ok(!fs.existsSync(DELTA), 'delta consumed');
    assert.match(fs.readFileSync(CHANGELOG, 'utf-8'), /"action":"promote","id":"R-001"/);
  } finally { restore(); }
});

test('deprecates an active rule into deprecated', () => {
  const restore = backup();
  try {
    fs.writeFileSync(ACTIVE, activeFlow(ACTIVE_11));
    fs.writeFileSync(QUAR, quarBlock(QUAR_4));
    fs.writeFileSync(DEPR, '# dep\nversion: 1\ndeprecated: []\n');
    fs.writeFileSync(DELTA, JSON.stringify({ status: 'proposed', promote: [], deprecate: [{ id: 'R-002', from: 'active', to: 'deprecated', reason: 'G9: stale' }] }));
    const r = run();
    assert.strictEqual(r.status, 0, r.out);
    assert.ok(!ids(parse(ACTIVE).active).includes('R-002'), 'R-002 left active');
    assert.ok(ids(parse(DEPR).deprecated).includes('R-002'), 'R-002 now deprecated');
  } finally { restore(); }
});

test('rejects promote of a rule not in quarantine', () => {
  const restore = backup();
  try {
    fs.writeFileSync(ACTIVE, activeFlow(ACTIVE_11));
    fs.writeFileSync(QUAR, quarBlock(QUAR_4));
    fs.writeFileSync(DEPR, '# dep\nversion: 1\ndeprecated: []\n');
    fs.writeFileSync(DELTA, JSON.stringify({ promote: [{ id: 'R-002', from: 'quarantine', to: 'active' }], deprecate: [] }));
    const r = run();
    assert.strictEqual(r.status, 1);
    assert.match(r.out, /not in quarantine/);
    assert.ok(fs.existsSync(DELTA), 'delta preserved on rejection');
  } finally { restore(); }
});

test('rejects promote of a transcript-gated rule (G5)', () => {
  const restore = backup();
  try {
    fs.writeFileSync(ACTIVE, activeFlow(ACTIVE_11));
    fs.writeFileSync(QUAR, quarBlock(QUAR_4));
    fs.writeFileSync(DEPR, '# dep\nversion: 1\ndeprecated: []\n');
    fs.writeFileSync(DELTA, JSON.stringify({ promote: [{ id: 'R-007', from: 'quarantine', to: 'active' }], deprecate: [] }));
    const r = run();
    assert.strictEqual(r.status, 1);
    assert.match(r.out, /requires_transcript_access/);
  } finally { restore(); }
});

test('no-delta is a clean no-op', () => {
  const restore = backup();
  try {
    try { fs.unlinkSync(DELTA); } catch {}
    const r = run();
    assert.strictEqual(r.status, 0);
    assert.match(r.out, /"status":"no-delta"/);
  } finally { restore(); }
});
